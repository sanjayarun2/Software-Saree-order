const STORAGE_KEY = "saree_device_id";

function randomId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
}

/** Stable id for this browser/app install (for user_devices rows). */
export function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "";
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing?.trim()) return existing.trim();
    const next = randomId();
    window.localStorage.setItem(STORAGE_KEY, next);
    return next;
  } catch {
    return randomId();
  }
}
