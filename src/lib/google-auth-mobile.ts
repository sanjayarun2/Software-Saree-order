import { supabase } from "./supabase";
import { saveMobile } from "./mobile-storage";

export const PENDING_MOBILE_STORAGE_KEY = "saree_pending_mobile";
/** @deprecated Login no longer requires pre-staged mobile for Google. */
export const MOBILE_REQUIRED_SESSION_KEY = "saree_google_mobile_required";

const MIN_MOBILE_DIGITS = 10;

export function normalizeMobileInput(raw: string): string {
  return raw.replace(/\s+/g, "").trim();
}

export function isValidMobile(mobile: string): boolean {
  const digits = mobile.replace(/\D/g, "");
  return digits.length >= MIN_MOBILE_DIGITS;
}

export async function userProfileHasMobile(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("mobile")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return false;
  return Boolean(data?.mobile?.trim());
}

export async function saveMobileToUserProfile(
  userId: string,
  mobile: string,
  email?: string | null
): Promise<{ ok: true } | { ok: false; message: string }> {
  const normalized = normalizeMobileInput(mobile);
  if (!isValidMobile(normalized)) {
    return { ok: false, message: "MOBILE_INVALID" };
  }

  const payload: { user_id: string; mobile: string; email?: string; updated_at: string } = {
    user_id: userId,
    mobile: normalized,
    updated_at: new Date().toISOString(),
  };
  if (email?.trim()) payload.email = email.trim();

  const { error } = await supabase.from("user_profiles").upsert(payload, { onConflict: "user_id" });
  if (error) {
    return { ok: false, message: error.message };
  }

  saveMobile(normalized);
  return { ok: true };
}

/** @deprecated Use saveMobileToUserProfile after signup. */
export function stageMobileForGoogleAuth(mobile: string): { ok: true; mobile: string } | { ok: false; message: string } {
  const normalized = normalizeMobileInput(mobile);
  if (!normalized || !isValidMobile(normalized)) {
    return { ok: false, message: "MOBILE_INVALID" };
  }
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(PENDING_MOBILE_STORAGE_KEY, normalized);
      localStorage.setItem("saree_app_returning", "1");
    } catch {
      return { ok: false, message: "MOBILE_REQUIRED" };
    }
  }
  saveMobile(normalized);
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

/** @deprecated Login flow no longer redirects for missing mobile. */
export function markMobileRequiredRedirect(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(MOBILE_REQUIRED_SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** @deprecated */
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
