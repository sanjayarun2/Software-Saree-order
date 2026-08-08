import { supabase } from "./supabase";

/**
 * Client for WhatsApp Embedded Signup → Chatwoot connect.
 * Talks only to the whatsapp-connect Edge Function (no Meta secrets in browser).
 */

const FUNCTION = "whatsapp-connect";

export type WhatsAppConnectStatus = "connected" | "needs_reauth" | "disconnected";

export interface WhatsAppConnectState {
  status: WhatsAppConnectStatus;
  phone_number: string;
  phone_number_id: string;
  waba_id: string;
  chatwoot_inbox_id: string;
  connected_at?: string | null;
  last_health_at?: string | null;
  last_error: string;
  config?: { meta_app_id: string; config_id: string };
}

async function readInvokeError(
  error: { message?: string; context?: unknown },
  data: unknown
): Promise<string> {
  if (data && typeof data === "object" && "error" in data && (data as { error: unknown }).error) {
    return String((data as { error: unknown }).error);
  }
  const ctx = error.context;
  if (ctx && typeof ctx === "object" && typeof (ctx as Response).json === "function") {
    try {
      const payload = await (ctx as Response).clone().json();
      if (payload && typeof payload === "object" && "error" in payload && payload.error) {
        return String(payload.error);
      }
    } catch {
      /* ignore */
    }
  }
  return error.message || "WhatsApp connect request failed";
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(FUNCTION, { body });
  if (error) {
    const detail = await readInvokeError(error, data);
    if (/function not found|404|not deployed/i.test(detail)) {
      throw new Error(
        "WhatsApp connect is not deployed. Deploy the whatsapp-connect Supabase Edge Function."
      );
    }
    throw new Error(detail);
  }
  if (data && typeof data === "object" && "error" in data && (data as { error: unknown }).error) {
    throw new Error(String((data as { error: unknown }).error));
  }
  return data as T;
}

export async function getWhatsAppConnectStatus(): Promise<WhatsAppConnectState> {
  return invoke<WhatsAppConnectState>({ action: "status" });
}

export async function completeWhatsAppConnect(input: {
  code: string;
  waba_id?: string;
  phone_number_id?: string;
  phone_number?: string;
  redirect_uri?: string;
}): Promise<WhatsAppConnectState & { ok?: boolean }> {
  return invoke({
    action: "complete",
    code: input.code,
    waba_id: input.waba_id ?? "",
    phone_number_id: input.phone_number_id ?? "",
    phone_number: input.phone_number ?? "",
    redirect_uri: input.redirect_uri ?? "",
  });
}

export async function disconnectWhatsAppConnect(): Promise<{ ok: boolean; status: string }> {
  return invoke({ action: "disconnect" });
}

export async function healthCheckWhatsAppConnect(): Promise<{
  ok: boolean;
  status: WhatsAppConnectStatus;
  error?: string;
  phone_number?: string;
}> {
  return invoke({ action: "health" });
}
