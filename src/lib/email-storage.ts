const STORAGE_KEY = "saree_app_recent_emails";
const MAX_EMAILS = 5;

export function getRecentEmails(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_EMAILS) : [];
  } catch {
    return [];
  }
}

export function saveEmail(email: string) {
  if (typeof window === "undefined" || !email?.trim()) return;
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return;
  try {
    const current = getRecentEmails().filter((e) => e !== trimmed);
    const updated = [trimmed, ...current].slice(0, MAX_EMAILS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
}
