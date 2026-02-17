 "use client";

import { useEffect, useState } from "react";

/**
 * Persist a simple text field in localStorage so that if the user switches apps/tabs
 * and comes back later, the value is restored.
 */
export function usePersistentField(key: string, initialValue: string) {
  const [value, setValue] = useState(initialValue);

  // Load from localStorage once on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(key);
      if (stored !== null) {
        setValue(stored);
      }
    } catch {
      // ignore storage errors
    }
  }, [key]);

  // Save to localStorage whenever value changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // ignore storage errors
    }
  }, [key, value]);

  // Helper to clear when a form is successfully submitted
  const clear = () => {
    setValue("");
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  };

  return { value, setValue, clear };
}

