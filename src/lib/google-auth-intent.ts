export type GoogleAuthIntent = "login" | "signup";

const INTENT_STORAGE_KEY = "saree_google_auth_intent";

export function stageGoogleAuthIntent(intent: GoogleAuthIntent): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(INTENT_STORAGE_KEY, intent);
  } catch {
    /* ignore */
  }
}

export function peekGoogleAuthIntent(): GoogleAuthIntent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(INTENT_STORAGE_KEY);
    return raw === "signup" || raw === "login" ? raw : null;
  } catch {
    return null;
  }
}

export function consumeGoogleAuthIntent(): GoogleAuthIntent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(INTENT_STORAGE_KEY);
    sessionStorage.removeItem(INTENT_STORAGE_KEY);
    return raw === "signup" || raw === "login" ? raw : null;
  } catch {
    return null;
  }
}
