import { supabase } from "./supabase";

export type ApiProvider = "velo_website";

export const DEFAULT_VELO_WEBSITE_BASE_URL = "https://sakthi-textiles-shop.vercel.app";

export interface ApiIntegrationRow {
  id: string;
  user_id: string;
  provider: ApiProvider;
  label: string;
  api_key: string;
  api_base_url: string;
  last_since: string | null;
  enabled: boolean;
  last_sync_at: string | null;
  last_error: string | null;
  updated_at: string;
}

export async function listApiIntegrations(userId: string): Promise<ApiIntegrationRow[]> {
  const { data, error } = await supabase
    .from("api_integrations")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) {
    console.warn("[API Settings] listApiIntegrations error:", error);
    return [];
  }
  return (data as ApiIntegrationRow[]) ?? [];
}

export async function getEnabledApiIntegrations(userId: string): Promise<ApiIntegrationRow[]> {
  const { data, error } = await supabase
    .from("api_integrations")
    .select("*")
    .eq("user_id", userId)
    .eq("enabled", true)
    .order("updated_at", { ascending: false });
  if (error) {
    console.warn("[API Settings] getEnabledApiIntegrations error:", error);
    return [];
  }
  return (data as ApiIntegrationRow[]) ?? [];
}

export async function upsertApiIntegration(
  userId: string,
  row: {
    id?: string;
    provider?: ApiProvider;
    label: string;
    api_key: string;
    api_base_url?: string;
    enabled?: boolean;
    last_since?: string | null;
    last_sync_at?: string | null;
    last_error?: string | null;
  }
): Promise<{ data: ApiIntegrationRow | null; error: Error | null }> {
  const payload = {
    user_id: userId,
    provider: row.provider ?? "velo_website",
    label: row.label.trim() || "Velo Website",
    api_key: row.api_key.trim(),
    api_base_url: (row.api_base_url?.trim() || DEFAULT_VELO_WEBSITE_BASE_URL).replace(/\/$/, ""),
    enabled: row.enabled ?? true,
    last_since: row.last_since ?? null,
    last_sync_at: row.last_sync_at ?? null,
    last_error: row.last_error ?? null,
    updated_at: new Date().toISOString(),
    ...(row.id ? { id: row.id } : {}),
  };

  const query = row.id
    ? supabase.from("api_integrations").upsert(payload, { onConflict: "id" })
    : supabase.from("api_integrations").insert(payload);

  const { data, error } = await query.select().single();

  if (error) {
    console.warn("[API Settings] upsertApiIntegration error:", error);
    return { data: null, error };
  }
  return { data: data as ApiIntegrationRow, error: null };
}

export async function deleteApiIntegration(
  userId: string,
  integrationId: string
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from("api_integrations")
    .delete()
    .eq("user_id", userId)
    .eq("id", integrationId);
  if (error) {
    console.warn("[API Settings] deleteApiIntegration error:", error);
    return { error };
  }
  return { error: null };
}

export async function updateApiIntegrationSyncState(
  integrationId: string,
  patch: {
    last_since?: string | null;
    last_sync_at?: string | null;
    last_error?: string | null;
  }
): Promise<void> {
  const { error } = await supabase
    .from("api_integrations")
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("id", integrationId);
  if (error) {
    console.warn("[API Settings] updateApiIntegrationSyncState error:", error);
  }
}
