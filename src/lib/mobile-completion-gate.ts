export const PENDING_MOBILE_COMPLETION_KEY = "saree_pending_mobile_completion";

export function markPendingMobileCompletion(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(PENDING_MOBILE_COMPLETION_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function hasPendingMobileCompletion(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(PENDING_MOBILE_COMPLETION_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearPendingMobileCompletion(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(PENDING_MOBILE_COMPLETION_KEY);
  } catch {
    /* ignore */
  }
}
