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
        <div className="flex flex-col items-center gap-8 px-8">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl p-3 md:h-24 md:w-24 md:p-4">
            <img
              src="/icon.svg"
              alt="Saree Order Book"
              className="h-full w-full object-contain"
              width={96}
              height={96}
            />
          </div>
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-200 border-t-primary-500 dark:border-primary-900 dark:border-t-primary-400" />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
