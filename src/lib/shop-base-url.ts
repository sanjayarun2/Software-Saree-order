import { DEFAULT_VELO_WEBSITE_BASE_URL, getEnabledApiIntegrations } from "./api-settings-supabase";

export async function getVeloShopBaseUrl(userId: string): Promise<string> {
  const integrations = await getEnabledApiIntegrations(userId);
  const row = integrations.find((i) => i.provider === "velo_website") ?? integrations[0];
  const base = row?.api_base_url?.trim();
  return base || DEFAULT_VELO_WEBSITE_BASE_URL;
}
