"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { DashboardSkeleton } from "@/components/ui/DashboardSkeleton";
import { BentoCard } from "@/components/ui/BentoCard";
import { getProductCodeBatches } from "@/lib/product-code-storage";
import {
  getProductCodeBatchImages,
  storedImageToBlob,
  type StoredBatchImage,
} from "@/lib/product-code-batch-images";

function BatchDetailInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const batchId = searchParams.get("id")?.trim() ?? "";
  const { user, loading: authLoading } = useAuth();
  const [images, setImages] = useState<StoredBatchImage[]>([]);
  const [loading, setLoading] = useState(true);

  const urls = useMemo(
    () => images.map((im) => URL.createObjectURL(storedImageToBlob(im))),
    [images]
  );

  useEffect(() => {
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [urls]);

  const load = useCallback(async () => {
    if (!user?.id || !batchId) return;
    setLoading(true);
    try {
      const batches = await getProductCodeBatches(user.id);
      const exists = batches.some((b) => b.id === batchId);
      if (!exists) {
        router.replace("/product-codes/");
        return;
      }
      const imgs = await getProductCodeBatchImages(user.id, batchId);
      setImages(imgs);
    } finally {
      setLoading(false);
    }
  }, [user?.id, batchId, router]);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login/");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!batchId) {
      router.replace("/product-codes/");
      return;
    }
    if (user?.id) void load();
  }, [user?.id, batchId, load, router]);

  if (authLoading || !user) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
        <button
          type="button"
          onClick={() => router.push("/product-codes/")}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[12px] bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-200"
          aria-label="Back"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Batch</h1>
      </header>

      <div className="mx-auto w-full max-w-6xl flex-1 space-y-4 px-4 py-6 pb-28">
        {loading ? (
          <DashboardSkeleton />
        ) : images.length === 0 ? (
          <BentoCard>
            <p className="text-center text-sm text-gray-500 dark:text-slate-400">
              No saved images for this batch (older batches may not have stored photos).
            </p>
          </BentoCard>
        ) : (
          <div className="space-y-4">
            {images.map((im, i) => (
              <BentoCard key={`${im.code}-${i}`} className="overflow-hidden p-0">
                <div className="aspect-[4/3] w-full bg-gray-100 dark:bg-slate-900">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={urls[i]} alt={im.code} className="h-full w-full object-contain" />
                </div>
                <p className="border-t border-gray-200/80 px-4 py-3 font-mono text-sm font-semibold text-gray-900 dark:border-white/10 dark:text-slate-100">
                  {im.code}
                </p>
              </BentoCard>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProductCodeBatchPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <BatchDetailInner />
    </Suspense>
  );
}
