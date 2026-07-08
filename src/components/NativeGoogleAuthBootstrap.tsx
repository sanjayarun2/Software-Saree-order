"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { isNativeGoogleSignInConfigured } from "@/lib/google-client-config";
import { ensureNativeGoogleAuthInitialized } from "@/lib/native-google-sign-in";

/** Pre-initialize native Google Sign-In so the account picker opens instantly. */
export function NativeGoogleAuthBootstrap() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !isNativeGoogleSignInConfigured()) return;
    void ensureNativeGoogleAuthInitialized().catch(() => {
      /* Sign-in button will surface configuration errors */
    });
  }, []);

  return null;
}
