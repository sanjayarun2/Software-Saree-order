import { supabase } from "./supabase";

/**
 * Client for the unified Messages inbox.
 *
 * Every call goes through the `chatwoot-proxy` Edge Function rather than
 * hitting Chatwoot directly, because the Android WebView origin would fail
 * CORS and the access token must stay server-side.
 */

const PROXY_FUNCTION = "chatwoot-proxy";

export type ChatwootChannel =
  | "whatsapp"
  | "instagram"
  | "facebook"
  | "email"
  | "sms"
  | "telegram"
  | "web"
  | "other";

export type ConversationStatus = "open" | "pending" | "resolved";

export interface InboxConversation {
  id: number;
  channel: ChatwootChannel;
  status: ConversationStatus;
  contactName: string;
  contactIdentifier: string;
  avatarUrl: string;
  lastMessage: string;
  lastActivityAt: number;
  unreadCount: number;
}

export interface InboxMessage {
  id: number;
  content: string;
  /** true when the customer sent it, false when the shop replied. */
  incoming: boolean;
  createdAt: number;
  attachmentUrls: string[];
  /** Chatwoot reports delivery failures per message. */
  failed: boolean;
}

export interface InboxSummary {
  id: number;
  name: string;
  channel: ChatwootChannel;
}

export interface ChatwootCredentials {
  base_url: string;
  access_token: string;
  account_id: string;
  inbox_id?: string;
}

/** Raw Chatwoot shapes, narrowed to only what the inbox renders. */
type RawSender = {
  name?: string;
  phone_number?: string | null;
  email?: string | null;
  thumbnail?: string | null;
  identifier?: string | null;
};

type RawMessage = {
  id?: number;
  content?: string | null;
  message_type?: number | string;
  created_at?: number;
  private?: boolean;
  status?: string;
  attachments?: Array<{ data_url?: string | null; thumb_url?: string | null }>;
};

type RawConversation = {
  id?: number;
  status?: string;
  unread_count?: number;
  timestamp?: number;
  last_activity_at?: number;
  messages?: RawMessage[];
  last_non_activity_message?: RawMessage | null;
  meta?: {
    sender?: RawSender;
    channel?: string;
  };
};

async function readInvokeErrorDetail(
  error: { message?: string; context?: unknown },
  data: unknown
): Promise<string> {
  // Prefer the JSON body from the Edge Function — supabase-js otherwise only
  // surfaces the generic "non-2xx status code" message.
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
      /* ignore parse failures */
    }
  }
  return error.message || "Messages request failed";
}

async function invokeProxy<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(PROXY_FUNCTION, { body });
  if (error) {
    const detail = await readInvokeErrorDetail(error, data);
    if (/function not found|404|not deployed/i.test(detail)) {
      throw new Error(
        "Messages proxy is not deployed. Deploy the chatwoot-proxy Supabase Edge Function."
      );
    }
    throw new Error(formatProxyError(detail));
  }
  if (data && typeof data === "object" && "error" in data && (data as { error: unknown }).error) {
    throw new Error(String((data as { error: unknown }).error));
  }
  return data as T;
}

function formatProxyError(message: string): string {
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return "Cannot reach the Messages server from this device. Check your internet connection.";
  }
  return message || "Messages request failed";
}

/** Chatwoot names channels like `Channel::Whatsapp`. */
export function normalizeChannel(raw: string | undefined | null): ChatwootChannel {
  const value = (raw ?? "").toLowerCase();
  if (value.includes("whatsapp")) return "whatsapp";
  if (value.includes("instagram")) return "instagram";
  if (value.includes("facebook")) return "facebook";
  if (value.includes("email")) return "email";
  if (value.includes("sms") || value.includes("twilio")) return "sms";
  if (value.includes("telegram")) return "telegram";
  if (value.includes("widget") || value.includes("api")) return "web";
  return "other";
}

function normalizeStatus(raw: string | undefined): ConversationStatus {
  if (raw === "resolved") return "resolved";
  if (raw === "pending") return "pending";
  return "open";
}

/** Chatwoot uses 0 = incoming, 1 = outgoing, 2 = activity, 3 = template. */
function isIncoming(messageType: number | string | undefined): boolean {
  return Number(messageType) === 0;
}

function isActivity(messageType: number | string | undefined): boolean {
  return Number(messageType) === 2;
}

function toMillis(seconds: number | undefined): number {
  if (!seconds || Number.isNaN(seconds)) return 0;
  // Chatwoot timestamps are unix seconds; guard against ms values.
  return seconds > 1e12 ? seconds : seconds * 1000;
}

export function normalizeConversation(raw: RawConversation): InboxConversation {
  const sender = raw.meta?.sender ?? {};
  const preview = raw.last_non_activity_message ?? raw.messages?.[raw.messages.length - 1] ?? null;
  const attachmentCount = preview?.attachments?.length ?? 0;

  return {
    id: Number(raw.id ?? 0),
    channel: normalizeChannel(raw.meta?.channel),
    status: normalizeStatus(raw.status),
    contactName: (sender.name ?? "").trim() || "Unknown customer",
    contactIdentifier:
      (sender.phone_number ?? "").trim() ||
      (sender.email ?? "").trim() ||
      (sender.identifier ?? "").trim(),
    avatarUrl: (sender.thumbnail ?? "").trim(),
    lastMessage:
      (preview?.content ?? "").trim() || (attachmentCount ? "📎 Attachment" : ""),
    lastActivityAt: toMillis(raw.last_activity_at ?? raw.timestamp),
    unreadCount: Number(raw.unread_count ?? 0),
  };
}

export function normalizeMessage(raw: RawMessage): InboxMessage {
  const attachmentUrls = (raw.attachments ?? [])
    .map((a) => (a.data_url ?? a.thumb_url ?? "").trim())
    .filter(Boolean);

  return {
    id: Number(raw.id ?? 0),
    content: (raw.content ?? "").trim(),
    incoming: isIncoming(raw.message_type),
    createdAt: toMillis(raw.created_at),
    attachmentUrls,
    failed: raw.status === "failed",
  };
}

/** Activity entries and empty private notes are noise in a shop inbox. */
function isRenderableMessage(raw: RawMessage): boolean {
  if (isActivity(raw.message_type)) return false;
  if (raw.private) return false;
  const hasContent = Boolean((raw.content ?? "").trim());
  const hasAttachment = Boolean(raw.attachments?.length);
  return hasContent || hasAttachment;
}

function extractPayload(data: unknown): RawConversation[] | RawMessage[] {
  if (Array.isArray(data)) return data as RawMessage[];
  if (!data || typeof data !== "object") return [];
  const record = data as Record<string, unknown>;
  if (Array.isArray(record.payload)) return record.payload as RawMessage[];
  const nested = record.data;
  if (nested && typeof nested === "object" && Array.isArray((nested as Record<string, unknown>).payload)) {
    return (nested as { payload: RawMessage[] }).payload;
  }
  return [];
}

export async function listConversations(options?: {
  status?: "open" | "pending" | "resolved" | "all";
  page?: number;
}): Promise<InboxConversation[]> {
  const data = await invokeProxy<unknown>({
    action: "list_conversations",
    status: options?.status ?? "open",
    page: options?.page ?? 1,
  });

  return (extractPayload(data) as RawConversation[])
    .map(normalizeConversation)
    .filter((c) => c.id > 0)
    .sort((a, b) => b.lastActivityAt - a.lastActivityAt);
}

export async function listMessages(conversationId: number): Promise<InboxMessage[]> {
  const data = await invokeProxy<unknown>({
    action: "list_messages",
    conversation_id: conversationId,
  });

  return (extractPayload(data) as RawMessage[])
    .filter(isRenderableMessage)
    .map(normalizeMessage)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function sendMessage(
  conversationId: number,
  content: string
): Promise<InboxMessage> {
  const data = await invokeProxy<RawMessage>({
    action: "send_message",
    conversation_id: conversationId,
    content,
  });
  return normalizeMessage(data ?? {});
}

export async function setConversationStatus(
  conversationId: number,
  status: ConversationStatus
): Promise<void> {
  await invokeProxy<unknown>({
    action: "toggle_status",
    conversation_id: conversationId,
    status,
  });
}

/** Used by the settings screen to verify credentials before saving. */
export async function testChatwootConnection(
  credentials: ChatwootCredentials
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await invokeProxy<unknown>({ action: "test", ...credentials });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

type RawInbox = {
  id?: number;
  name?: string;
  channel_type?: string;
};

/** Lists Chatwoot inboxes for the connected shop (channel badges on settings). */
export async function listInboxes(): Promise<InboxSummary[]> {
  const data = await invokeProxy<unknown>({ action: "list_inboxes" });
  const rows = extractInboxPayload(data);
  return rows
    .map((raw) => ({
      id: Number(raw.id ?? 0),
      name: (raw.name ?? "").trim() || `Inbox ${raw.id ?? "?"}`,
      channel: normalizeChannel(raw.channel_type),
    }))
    .filter((inbox) => inbox.id > 0);
}

function extractInboxPayload(data: unknown): RawInbox[] {
  if (Array.isArray(data)) return data as RawInbox[];
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    if (Array.isArray(record.payload)) return record.payload as RawInbox[];
    if (Array.isArray(record.data)) return record.data as RawInbox[];
  }
  return [];
}
