import { useLayoutEffect, useRef } from "react";

const DISMISS_GUARD_MS = 500;

/** Ignore backdrop dismiss briefly after open (mobile ghost-click after card tap). */
export function useBackdropDismissGuard(open: boolean) {
  const openedAtRef = useRef(0);
  const wasOpenRef = useRef(false);

  // Set timestamp synchronously on open transition (before paint / ghost click).
  if (open && !wasOpenRef.current) {
    openedAtRef.current = performance.now();
  }
  wasOpenRef.current = open;

  useLayoutEffect(() => {
    if (open) openedAtRef.current = performance.now();
  }, [open]);

  function shouldDismissBackdrop(target: EventTarget | null, currentTarget: EventTarget | null) {
    if (target !== currentTarget) return false;
    return performance.now() - openedAtRef.current >= DISMISS_GUARD_MS;
  }

  return shouldDismissBackdrop;
}
