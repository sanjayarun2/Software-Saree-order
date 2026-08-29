/** Hosts that must never be used as a silent fallback (retired / disabled shops). */
const BLOCKED_LEGACY_HOSTS = new Set([
  "sakthi-textiles-shop.vercel.app",
]);

export const MISSING_SHOP_URL_MESSAGE =
  "Add your website URL in Settings → API (e.g. https://www.your-shop.com).";

/** Normalize storefront origin: trim, force scheme, drop trailing slash and query/hash. */
export function tryNormalizeShopBaseUrl(input: string | null | undefined): string | null {
  let raw = (input || "").trim();
  if (!raw) return null;

  if (!/^https?:\/\//i.test(raw)) {
    raw = `https://${raw.replace(/^\/+/, "")}`;
  }

  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    if (!host || BLOCKED_LEGACY_HOSTS.has(host)) return null;
    const path = url.pathname.replace(/\/+$/, "");
    return `${url.origin}${path === "/" ? "" : path}`;
  } catch {
    return null;
  }
}

/**
 * Normalize a shop base URL. Returns "" when missing/invalid —
 * never invents a default shop hostname.
 */
export function normalizeShopBaseUrl(input: string | null | undefined): string {
  return tryNormalizeShopBaseUrl(input) ?? "";
}

export function requireShopBaseUrl(input: string | null | undefined): string {
  const url = tryNormalizeShopBaseUrl(input);
  if (!url) {
    throw new Error(MISSING_SHOP_URL_MESSAGE);
  }
  return url;
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
