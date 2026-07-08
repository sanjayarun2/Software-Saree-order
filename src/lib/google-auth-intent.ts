export type GoogleAuthIntent = "login" | "signup";

const INTENT_STORAGE_KEY = "saree_google_auth_intent";

function readIntent(): GoogleAuthIntent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw =
      localStorage.getItem(INTENT_STORAGE_KEY) ?? sessionStorage.getItem(INTENT_STORAGE_KEY);
    return raw === "signup" || raw === "login" ? raw : null;
  } catch {
    return null;
  }
}

function writeIntent(intent: GoogleAuthIntent): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(INTENT_STORAGE_KEY, intent);
    sessionStorage.setItem(INTENT_STORAGE_KEY, intent);
  } catch {
    /* ignore */
  }
}

function clearIntent(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(INTENT_STORAGE_KEY);
    sessionStorage.removeItem(INTENT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function stageGoogleAuthIntent(intent: GoogleAuthIntent): void {
  writeIntent(intent);
}

export function peekGoogleAuthIntent(): GoogleAuthIntent | null {
  return readIntent();
}

export function consumeGoogleAuthIntent(): GoogleAuthIntent | null {
  const intent = readIntent();
  clearIntent();
  return intent;
}
