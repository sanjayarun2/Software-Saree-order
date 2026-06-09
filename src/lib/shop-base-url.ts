import {
  DEFAULT_VELO_WEBSITE_BASE_URL,
  getPrimaryEnabledIntegration,
} from "./api-settings-supabase";
import { normalizeShopBaseUrl } from "./shop-url-utils";

const CACHE_MS = 60_000;
const cache = new Map<string, { url: string; at: number }>();

export function invalidateVeloShopBaseUrlCache(userId?: string): void {
  if (userId) cache.delete(userId);
  else cache.clear();
}

/**
 * Storefront origin for customer share links.
 * Uses the same enabled Velo integration (with API key) as product API calls.
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
  const raw = row?.api_base_url?.trim() || DEFAULT_VELO_WEBSITE_BASE_URL;
  const url = normalizeShopBaseUrl(raw);
  cache.set(userId, { url, at: Date.now() });
  return url;
}
