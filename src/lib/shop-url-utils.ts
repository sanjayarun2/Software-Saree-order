import { DEFAULT_VELO_WEBSITE_BASE_URL } from "./api-settings-supabase";

/** Normalize storefront origin: trim, force scheme, drop trailing slash and query/hash. */
export function normalizeShopBaseUrl(
  input: string,
  fallback = DEFAULT_VELO_WEBSITE_BASE_URL
): string {
  let raw = (input || "").trim() || fallback;

  if (!/^https?:\/\//i.test(raw)) {
    raw = `https://${raw.replace(/^\/+/, "")}`;
  }

  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return normalizeShopBaseUrl(fallback, fallback);
    }
    const path = url.pathname.replace(/\/+$/, "");
    return `${url.origin}${path}`;
  } catch {
    return normalizeShopBaseUrl(fallback, fallback);
  }
}

export function encodeShopPathSegment(value: string): string {
  return encodeURIComponent(value.trim());
}

/** True when value looks like a non-empty product id (UUID or opaque id). */
export function isUsableShopProductId(productId: string): boolean {
  const id = productId.trim();
  if (!id) return false;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return true;
  }
  return id.length >= 8 && id.length <= 128;
}
