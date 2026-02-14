"use client";

import React, { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";

/**
 * Keeps splash screen visible until auth is ready.
 * Hides splash with smooth transition (Capacitor only).
 */
export function SplashController({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();
  const hidRef = useRef(false);

  useEffect(() => {
    if (hidRef.current) return;
    if (!loading) {
      hidRef.current = true;
      const cap = (typeof window !== "undefined" && (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor);
      if (cap?.isNativePlatform?.()) {
        import("@capacitor/splash-screen")
          .then(({ SplashScreen }) => SplashScreen.hide())
          .catch(() => {});
      }
    }
  }, [loading]);

  return <>{children}</>;
}
