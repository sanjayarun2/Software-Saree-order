const STORAGE_KEY = "saree_app_recent_mobiles";
const MAX_MOBILES = 5;

export function getRecentMobiles(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_MOBILES) : [];
  } catch {
    return [];
  }
}

export function saveMobile(mobile: string) {
  if (typeof window === "undefined" || !mobile?.trim()) return;
  const trimmed = mobile.trim();
  if (!trimmed) return;
  try {
    const current = getRecentMobiles().filter((m) => m !== trimmed);
    const updated = [trimmed, ...current].slice(0, MAX_MOBILES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
}
