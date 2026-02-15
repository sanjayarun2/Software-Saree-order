"use client";

import React, { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";

/**
 * Shows centered logo splash while auth loads; hides Capacitor native splash when ready.
 * Industry-standard: centered logo, proper size, subtle spinner.
 */
export function SplashController({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();
  const hidRef = useRef(false);

  useEffect(() => {
    if (hidRef.current) return;
    if (!loading) {
      hidRef.current = true;
      const w = typeof window !== "undefined" ? (window as { Capacitor?: { isNativePlatform?: () => boolean } }) : null;
      const cap = w?.Capacitor;
      if (typeof cap?.isNativePlatform === "function" && cap.isNativePlatform()) {
        import("@capacitor/splash-screen")
          .then(({ SplashScreen }) => SplashScreen.hide())
          .catch(() => {});
      }
    }
  }, [loading]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-[100] flex min-h-dvh flex-col items-center justify-center bg-[var(--bento-bg)]">
        <div className="flex flex-col items-center gap-6 px-8">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center md:h-16 md:w-16">
            <img
              src="/icon.svg"
              alt="Saree Order Book"
              className="h-full w-full object-contain"
              width={64}
              height={64}
              fetchPriority="high"
            />
          </div>
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-200 border-t-primary-500 dark:border-primary-900 dark:border-t-primary-400" />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
