const PENDING_NAV_KEY = "saree_pending_nav_v1";

export function stagePendingNavigation(path: string): void {
  if (typeof window === "undefined") return;
  if (!path.startsWith("/")) return;
  try {
    sessionStorage.setItem(PENDING_NAV_KEY, path);
  } catch {
    /* ignore */
  }
}

export function peekPendingNavigation(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PENDING_NAV_KEY);
    return raw?.startsWith("/") ? raw : null;
  } catch {
    return null;
  }
}

export function consumePendingNavigation(): string | null {
  const path = peekPendingNavigation();
  if (typeof window !== "undefined") {
    try {
      sessionStorage.removeItem(PENDING_NAV_KEY);
    } catch {
      /* ignore */
    }
  }
  return path;
}
