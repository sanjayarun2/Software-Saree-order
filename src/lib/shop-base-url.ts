import { getPrimaryEnabledIntegration } from "./api-settings-supabase";
import { tryNormalizeShopBaseUrl } from "./shop-url-utils";

const CACHE_MS = 60_000;
const cache = new Map<string, { url: string; at: number }>();

export function invalidateVeloShopBaseUrlCache(userId?: string): void {
  if (userId) cache.delete(userId);
  else cache.clear();
}

/**
 * Storefront origin for customer share links.
 * Uses the same enabled Velo integration (with API key) as product API calls.
 * Returns "" when the user has not configured a website URL yet.
 */
export async function getVeloShopBaseUrl(
  userId: string,
  opts?: { force?: boolean }
): Promise<string> {
  if (!opts?.force) {
    const hit = cache.get(userId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.url;
  }

  const row = await getPrimaryEnabledIntegration(userId);
  const url = tryNormalizeShopBaseUrl(row?.api_base_url) ?? "";
  cache.set(userId, { url, at: Date.now() });
  return url;
}
