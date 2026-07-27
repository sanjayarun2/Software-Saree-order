import { supabase } from "./supabase";

export type WhatsAppSendWhen = "create" | "despatch";

export const DEFAULT_WHATSAPP_PHONE_NUMBER_ID = "1220900331107308";

export interface WhatsAppSettingsRow {
  user_id: string;
  enabled: boolean;
  access_token: string;
  phone_number_id: string;
  template_name: string;
  template_language: string;
  send_when: WhatsAppSendWhen;
  updated_at: string;
}

export type WhatsAppSettingsInput = {
  enabled: boolean;
  access_token: string;
  phone_number_id: string;
  template_name: string;
  template_language: string;
  send_when: WhatsAppSendWhen;
};

export function emptyWhatsAppSettings(userId: string): WhatsAppSettingsRow {
  return {
    user_id: userId,
    enabled: false,
    access_token: "",
    phone_number_id: DEFAULT_WHATSAPP_PHONE_NUMBER_ID,
    template_name: "",
    template_language: "en",
    send_when: "create",
    updated_at: new Date().toISOString(),
  };
}

export async function getWhatsAppSettings(
  userId: string
): Promise<WhatsAppSettingsRow | null> {
  const { data, error } = await supabase
    .from("whatsapp_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.warn("[WhatsApp Settings] get error:", error.message);
    return null;
  }
  return (data as WhatsAppSettingsRow) ?? null;
}

export async function upsertWhatsAppSettings(
  userId: string,
  input: WhatsAppSettingsInput
): Promise<{ data: WhatsAppSettingsRow | null; error: Error | null }> {
  const payload = {
    user_id: userId,
    enabled: Boolean(input.enabled),
    access_token: input.access_token.trim(),
    phone_number_id: input.phone_number_id.trim() || DEFAULT_WHATSAPP_PHONE_NUMBER_ID,
    template_name: input.template_name.trim(),
    template_language: (input.template_language.trim() || "en").slice(0, 16),
    send_when: input.send_when === "despatch" ? "despatch" : "create",
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("whatsapp_settings")
    .upsert(payload, { onConflict: "user_id" })
    .select()
    .single();

  if (error) {
    console.warn("[WhatsApp Settings] upsert error:", error.message);
    return { data: null, error };
  }
  return { data: data as WhatsAppSettingsRow, error: null };
}
