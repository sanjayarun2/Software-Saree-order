import { supabase } from "./supabase";

/**
 * Shared Chatwoot server for all shops. Each shop still connects its own
 * WhatsApp / Instagram / Facebook accounts inside Chatwoot, so a per-user
 * account id + access token is required even though the host is common.
 */
export const DEFAULT_CHATWOOT_BASE_URL =
  process.env.NEXT_PUBLIC_CHATWOOT_BASE_URL?.trim() || "";

export interface ChatwootSettingsRow {
  user_id: string;
  enabled: boolean;
  base_url: string;
  access_token: string;
  account_id: string;
  inbox_id: string;
  updated_at: string;
}

export type ChatwootSettingsInput = {
  enabled: boolean;
  base_url: string;
  access_token: string;
  account_id: string;
  inbox_id: string;
};

export function emptyChatwootSettings(userId: string): ChatwootSettingsRow {
  return {
    user_id: userId,
    enabled: false,
    base_url: DEFAULT_CHATWOOT_BASE_URL,
    access_token: "",
    account_id: "",
    inbox_id: "",
    updated_at: new Date().toISOString(),
  };
}

/** Strips a trailing slash so path joins never produce a double slash. */
export function normalizeChatwootBaseUrl(raw: string): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";
  return trimmed.replace(/\/+$/, "");
}

export function isChatwootConfigured(
  row: ChatwootSettingsRow | null
): row is ChatwootSettingsRow {
  if (!row) return false;
  return Boolean(
    row.enabled &&
      normalizeChatwootBaseUrl(row.base_url) &&
      row.access_token.trim() &&
      row.account_id.trim()
  );
}

export async function getChatwootSettings(
  userId: string
): Promise<ChatwootSettingsRow | null> {
  const { data, error } = await supabase
    .from("chatwoot_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.warn("[Chatwoot Settings] get error:", error.message);
    return null;
  }
  return (data as ChatwootSettingsRow) ?? null;
}

export async function upsertChatwootSettings(
  userId: string,
  input: ChatwootSettingsInput
): Promise<{ data: ChatwootSettingsRow | null; error: Error | null }> {
  const payload = {
    user_id: userId,
    enabled: Boolean(input.enabled),
    base_url: normalizeChatwootBaseUrl(input.base_url),
    access_token: input.access_token.trim(),
    account_id: input.account_id.trim(),
    inbox_id: input.inbox_id.trim(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("chatwoot_settings")
    .upsert(payload, { onConflict: "user_id" })
    .select()
    .single();

  if (error) {
    console.warn("[Chatwoot Settings] upsert error:", error.message);
    return { data: null, error };
  }
  return { data: data as ChatwootSettingsRow, error: null };
}
