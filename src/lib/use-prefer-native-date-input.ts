"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";

/**
 * True on Capacitor APK/IPA and touch-first / narrow viewports where a visible
 * native <input type="date"> is more reliable than showPicker() on a hidden input.
 */
export function usePreferNativeDateInput(): boolean {
  const [prefer, setPrefer] = useState(true);

  useEffect(() => {
    const native = Capacitor.isNativePlatform();
    const narrow = window.matchMedia("(max-width: 767px)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    setPrefer(native || narrow || coarse);
  }, []);

  return prefer;
}
