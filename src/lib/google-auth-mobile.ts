import { supabase } from "./supabase";
import { saveMobile } from "./mobile-storage";

export const PENDING_MOBILE_STORAGE_KEY = "saree_pending_mobile";
export const MOBILE_REQUIRED_SESSION_KEY = "saree_google_mobile_required";

const MIN_MOBILE_DIGITS = 10;

export function normalizeMobileInput(raw: string): string {
  return raw.replace(/\s+/g, "").trim();
}

export function isValidMobile(mobile: string): boolean {
  const digits = mobile.replace(/\D/g, "");
  return digits.length >= MIN_MOBILE_DIGITS;
}

export type StageMobileResult =
  | { ok: true; mobile: string }
  | { ok: false; message: string };

/** Persist mobile for the upcoming Google OAuth round-trip (web + Capacitor). */
export function stageMobileForGoogleAuth(mobile: string): StageMobileResult {
  if (typeof window === "undefined") {
    return { ok: false, message: "MOBILE_REQUIRED" };
  }

  const normalized = normalizeMobileInput(mobile);
  if (!normalized) {
    return { ok: false, message: "MOBILE_REQUIRED" };
  }
  if (!isValidMobile(normalized)) {
    return { ok: false, message: "MOBILE_INVALID" };
  }

  saveMobile(normalized);
  try {
    localStorage.setItem(PENDING_MOBILE_STORAGE_KEY, normalized);
    localStorage.setItem("saree_app_returning", "1");
  } catch {
    return { ok: false, message: "MOBILE_REQUIRED" };
  }

  return { ok: true, mobile: normalized };
}

export function getPendingMobileForGoogleAuth(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(PENDING_MOBILE_STORAGE_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function clearPendingMobileForGoogleAuth(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(PENDING_MOBILE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function markMobileRequiredRedirect(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(MOBILE_REQUIRED_SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function consumeMobileRequiredRedirectFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (sessionStorage.getItem(MOBILE_REQUIRED_SESSION_KEY) !== "1") return false;
    sessionStorage.removeItem(MOBILE_REQUIRED_SESSION_KEY);
    return true;
  } catch {
    return false;
  }
}

/** After Google OAuth, ensure user_profiles has a mobile (existing or newly staged). */
export async function ensureGoogleUserHasMobile(
  userId: string,
  email?: string | null
): Promise<{ ok: true } | { ok: false }> {
  const pending = getPendingMobileForGoogleAuth();

  const { data: prof, error: readErr } = await supabase
    .from("user_profiles")
    .select("mobile")
    .eq("user_id", userId)
    .maybeSingle();

  if (readErr) return { ok: false };

  const existingMobile = prof?.mobile?.trim() ?? "";
  if (existingMobile) {
    clearPendingMobileForGoogleAuth();
    return { ok: true };
  }

  if (!pending) return { ok: false };

  const payload: { user_id: string; mobile: string; email?: string; updated_at: string } = {
    user_id: userId,
    mobile: pending,
    updated_at: new Date().toISOString(),
  };
  if (email?.trim()) payload.email = email.trim();

  const { error: upsertErr } = await supabase
    .from("user_profiles")
    .upsert(payload, { onConflict: "user_id" });

  if (upsertErr) return { ok: false };

  clearPendingMobileForGoogleAuth();
  return { ok: true };
}
