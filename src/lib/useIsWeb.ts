"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";

/**
 * Returns true only in the browser (non-Capacitor) environment.
 * On Android / iOS native, always returns false.
 */
export function useIsWeb(): boolean {
  const [isWeb, setIsWeb] = useState(false);

  useEffect(() => {
    setIsWeb(!Capacitor.isNativePlatform());
  }, []);

  return isWeb;
}
