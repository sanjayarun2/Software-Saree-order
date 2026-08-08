import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Server-side proxy for the Chatwoot application API.
 *
 * The Android WebView origin is not the Chatwoot origin, so calling Chatwoot
 * directly from the app fails CORS. Credentials also must never reach the
 * client, so the access token is resolved here from chatwoot_settings using
 * the service role and scoped to the calling user.
 *
 * Application errors are returned as HTTP 200 with `{ error: "..." }` so the
 * Supabase JS client can surface the real message instead of only
 * "Edge Function returned a non-2xx status code".
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Action =
  | "test"
  | "list_conversations"
  | "list_messages"
  | "send_message"
  | "toggle_status"
  | "list_inboxes";

const ALLOWED_ACTIONS = new Set<string>([
  "test",
  "list_conversations",
  "list_messages",
  "send_message",
  "toggle_status",
  "list_inboxes",
]);

const ALLOWED_CONVERSATION_STATUSES = new Set(["open", "pending", "resolved", "all"]);

const MAX_CONTENT_LEN = 4096;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return fail("Unauthorized. Sign in to Velo and try again.", 401);
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser();

    if (userError || !user) {
      return fail("Unauthorized. Sign in to Velo and try again.", 401);
    }

    const body = (await req.json()) as {
      action?: string;
      base_url?: string;
      access_token?: string;
      account_id?: string;
      inbox_id?: string;
      conversation_id?: number | string;
      status?: string;
      page?: number;
      content?: string;
      before?: number | string;
    };

    const action = (body.action ?? "").trim();
    if (!ALLOWED_ACTIONS.has(action)) {
      return fail(`Unsupported action: ${action || "(missing)"}`);
    }

    let baseUrl = "";
    let accessToken = "";
    let accountId = "";
    let inboxId = "";
    let requireInboxScope = false;

    const hasInlineCreds = Boolean(body.base_url && body.access_token && body.account_id);

    if (hasInlineCreds) {
      baseUrl = (body.base_url ?? "").trim();
      accessToken = (body.access_token ?? "").trim();
      accountId = (body.account_id ?? "").trim();
      inboxId = (body.inbox_id ?? "").trim();
    } else {
      const admin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );

      const { data: settings, error: settingsError } = await admin
        .from("chatwoot_settings")
        .select("base_url, access_token, account_id, inbox_id, enabled")
        .eq("user_id", user.id)
        .maybeSingle();

      if (settingsError || !settings) {
        return fail("Messages are not connected yet.");
      }
      if (!settings.enabled) {
        return fail("Messages are turned off in settings.");
      }

      baseUrl = (settings.base_url ?? "").trim();
      accessToken = (settings.access_token ?? "").trim();
      accountId = (settings.account_id ?? "").trim();
      inboxId = (settings.inbox_id ?? "").trim();

      // Fail closed for Connected WhatsApp shops: never list across all inboxes.
      const { data: waConn } = await admin
        .from("whatsapp_channel_connections")
        .select("status, chatwoot_inbox_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (waConn && waConn.status === "connected") {
        requireInboxScope = true;
        const scoped =
          (inboxId && /^\d+$/.test(inboxId) && inboxId) ||
          (waConn.chatwoot_inbox_id &&
          /^\d+$/.test(String(waConn.chatwoot_inbox_id))
            ? String(waConn.chatwoot_inbox_id)
            : "");
        if (!scoped) {
          return fail(
            "WhatsApp inbox is missing. Reconnect WhatsApp in Settings → Messages."
          );
        }
        inboxId = scoped;
      }
    }

    if (!baseUrl || !accessToken || !accountId) {
      return fail("Chatwoot server URL, token and account id are required.");
    }

    let origin: string;
    try {
      const parsed = new URL(baseUrl);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return fail("Chatwoot server URL must be http or https.");
      }
      origin = parsed.origin;
    } catch {
      return fail("Chatwoot server URL is not a valid URL.");
    }

    if (!/^\d+$/.test(accountId)) {
      return fail("Chatwoot account id must be a number.");
    }

    const accountBase = `${origin}/api/v1/accounts/${accountId}`;
    const upstream = buildUpstreamRequest(
      action as Action,
      origin,
      accountBase,
      inboxId,
      body,
      { requireInboxScope }
    );
    if ("error" in upstream) {
      return fail(upstream.error);
    }

    let chatwootRes: Response;
    try {
      chatwootRes = await fetch(upstream.url, {
        method: upstream.method,
        headers: {
          api_access_token: accessToken,
          "Content-Type": "application/json",
        },
        body: upstream.payload ? JSON.stringify(upstream.payload) : undefined,
        cache: "no-store",
      });
    } catch (e) {
      return fail(
        `Cannot reach Chatwoot at ${origin}. Is the tunnel running? ${(e as Error).message}`
      );
    }

    const text = await chatwootRes.text();
    let payload: unknown = text;
    try {
      payload = JSON.parse(text);
    } catch {
      /* keep raw text */
    }

    if (!chatwootRes.ok) {
      return fail(describeUpstreamError(chatwootRes.status, payload));
    }

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return fail((e as Error).message || "Chatwoot proxy failed");
  }
});

function buildUpstreamRequest(
  action: Action,
  origin: string,
  accountBase: string,
  inboxId: string,
  body: {
    conversation_id?: number | string;
    status?: string;
    page?: number;
    content?: string;
    before?: number | string;
  },
  opts: { requireInboxScope?: boolean } = {}
):
  | { url: string; method: "GET" | "POST"; payload?: Record<string, unknown> }
  | { error: string } {
  // Profile validates the access token without needing a conversation list.
  if (action === "test") {
    return { url: `${origin}/api/v1/profile`, method: "GET" };
  }

  if (action === "list_inboxes") {
    return { url: `${accountBase}/inboxes`, method: "GET" };
  }

  if (action === "list_conversations") {
    if (opts.requireInboxScope && !(/^\d+$/.test(inboxId))) {
      return {
        error: "WhatsApp inbox is missing. Reconnect WhatsApp in Settings → Messages.",
      };
    }
    const status = (body.status ?? "open").trim().toLowerCase();
    if (!ALLOWED_CONVERSATION_STATUSES.has(status)) {
      return { error: "Invalid status. Use open, pending, resolved or all." };
    }
    const params = new URLSearchParams({
      status,
      page: String(Math.min(Math.max(Number(body.page ?? 1) || 1, 1), 100)),
    });
    if (inboxId && /^\d+$/.test(inboxId)) params.set("inbox_id", inboxId);
    return { url: `${accountBase}/conversations?${params.toString()}`, method: "GET" };
  }

  const conversationId = String(body.conversation_id ?? "").trim();
  if (!/^\d+$/.test(conversationId)) {
    return { error: "A valid conversation id is required." };
  }

  if (action === "list_messages") {
    const params = new URLSearchParams();
    const before = String(body.before ?? "").trim();
    if (before && /^\d+$/.test(before)) params.set("before", before);
    const query = params.toString();
    return {
      url: `${accountBase}/conversations/${conversationId}/messages${query ? `?${query}` : ""}`,
      method: "GET",
    };
  }

  if (action === "send_message") {
    const content = (body.content ?? "").trim();
    if (!content) return { error: "Message text is empty." };
    if (content.length > MAX_CONTENT_LEN) {
      return { error: `Message is too long (max ${MAX_CONTENT_LEN} characters).` };
    }
    return {
      url: `${accountBase}/conversations/${conversationId}/messages`,
      method: "POST",
      payload: { content, message_type: "outgoing", private: false },
    };
  }

  const status = (body.status ?? "").trim().toLowerCase();
  if (!ALLOWED_CONVERSATION_STATUSES.has(status) || status === "all") {
    return { error: "Invalid status. Use open, pending or resolved." };
  }
  return {
    url: `${accountBase}/conversations/${conversationId}/toggle_status`,
    method: "POST",
    payload: { status },
  };
}

function describeUpstreamError(status: number, payload: unknown): string {
  if (status === 401 || status === 403) {
    return "Chatwoot rejected the access token. Copy a fresh Access Token from Chatwoot Profile Settings.";
  }
  if (status === 404) {
    return "Chatwoot could not find that account. Check Account ID in the URL (/app/accounts/NUMBER/).";
  }
  if (status === 530 || status === 502 || status === 503) {
    return "Chatwoot tunnel is down or restarting. Ask to revive the tunnel, then try again.";
  }
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of ["message", "error", "errors"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value;
      if (Array.isArray(value) && value.length) return String(value[0]);
    }
  }
  return `Chatwoot returned ${status}`;
}

/** App-level failures as HTTP 200 so the client can read `error` from the body. */
function fail(message: string, status = 200) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
