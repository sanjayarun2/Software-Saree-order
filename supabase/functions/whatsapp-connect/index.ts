import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

/**
 * WhatsApp Embedded Signup → Chatwoot WhatsApp Cloud inbox.
 *
 * Actions: complete | status | disconnect | health
 * Errors return HTTP 200 with `{ error: "..." }` so supabase-js surfaces them.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GRAPH_VERSION = "v25.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

type Action = "complete" | "status" | "disconnect" | "health";

type ConnectionRow = {
  user_id: string;
  phone_number: string;
  phone_number_id: string;
  waba_id: string;
  chatwoot_inbox_id: string;
  status: "connected" | "needs_reauth" | "disconnected";
  connected_at: string | null;
  last_health_at: string | null;
  last_error: string;
  updated_at: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return fail("Unauthorized. Sign in to Velo and try again.", 401);

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

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = (await req.json()) as {
      action?: string;
      code?: string;
      waba_id?: string;
      phone_number_id?: string;
      phone_number?: string;
    };

    const action = (body.action ?? "").trim() as Action;
    if (!["complete", "status", "disconnect", "health"].includes(action)) {
      return fail(`Unsupported action: ${action || "(missing)"}`);
    }

    if (action === "status") {
      return ok(await getStatusPayload(admin, user.id));
    }

    if (action === "disconnect") {
      return ok(await disconnectWhatsApp(admin, user.id));
    }

    if (action === "health") {
      return ok(await healthCheck(admin, user.id));
    }

    // action === complete
    const code = (body.code ?? "").trim();
    const wabaId = (body.waba_id ?? "").trim();
    const phoneNumberId = (body.phone_number_id ?? "").trim();
    if (!code) return fail("Missing Embedded Signup code. Try Connect WhatsApp again.");
    if (!wabaId) return fail("Missing WhatsApp Business Account ID from Meta signup.");
    if (!phoneNumberId) return fail("Missing phone number ID from Meta signup.");

    console.log(
      JSON.stringify({
        event: "whatsapp_connect_complete",
        user_id: user.id,
        waba_id: wabaId,
        phone_number_id: phoneNumberId,
      })
    );

    try {
      const result = await completeConnect(admin, user, {
        code,
        wabaId,
        phoneNumberId,
        phoneNumberHint: (body.phone_number ?? "").trim(),
      });
      return ok(result);
    } catch (e) {
      const message = (e as Error).message || "WhatsApp connect failed";
      if (isMetaAuthError(message)) {
        await markNeedsReauth(admin, user.id, message);
        return fail(
          "WhatsApp authorization expired or was revoked. Tap Connect WhatsApp again.",
          200
        );
      }
      throw e;
    }
  } catch (e) {
    return fail((e as Error).message || "WhatsApp connect failed");
  }
});

async function completeConnect(
  admin: SupabaseClient,
  user: { id: string; email?: string | null },
  input: { code: string; wabaId: string; phoneNumberId: string; phoneNumberHint: string }
) {
  const metaAppId = (Deno.env.get("META_APP_ID") ?? Deno.env.get("FB_APP_ID") ?? "").trim();
  const metaAppSecret = (
    Deno.env.get("META_APP_SECRET") ??
    Deno.env.get("FB_APP_SECRET") ??
    ""
  ).trim();
  if (!metaAppId || !metaAppSecret) {
    throw new Error(
      "Server is missing META_APP_ID / META_APP_SECRET. Ask an admin to set Edge Function secrets."
    );
  }

  const verifyToken = platformWebhookVerifyToken();
  const chatwootBase = normalizeBaseUrl(
    Deno.env.get("CHATWOOT_BASE_URL") ??
      Deno.env.get("NEXT_PUBLIC_CHATWOOT_BASE_URL") ??
      ""
  );

  const businessToken = await exchangeCodeForToken(metaAppId, metaAppSecret, input.code);
  await subscribeAppToWaba(input.wabaId, businessToken);
  await registerPhoneNumber(input.phoneNumberId, businessToken);

  const phoneInfo = await fetchPhoneInfo(input.phoneNumberId, businessToken);
  const displayPhone =
    normalizePhone(input.phoneNumberHint) ||
    normalizePhone(phoneInfo.display_phone_number) ||
    `+${input.phoneNumberId}`;

  if (chatwootBase) {
    await overridePhoneWebhook({
      phoneNumberId: input.phoneNumberId,
      token: businessToken,
      callbackUrl: `${chatwootBase}/webhooks/whatsapp/${displayPhone}`,
      verifyToken,
    });
  }

  const chatwoot = await resolveChatwootCreds(admin, user);
  const inbox = await upsertWhatsappInbox(chatwoot, {
    phoneNumber: displayPhone,
    phoneNumberId: input.phoneNumberId,
    wabaId: input.wabaId,
    apiKey: businessToken,
    webhookVerifyToken: verifyToken,
    existingInboxId: await getExistingInboxId(admin, user.id, input.phoneNumberId),
  });

  const now = new Date().toISOString();
  await admin.from("chatwoot_settings").upsert(
    {
      user_id: user.id,
      enabled: true,
      base_url: chatwoot.baseUrl,
      access_token: chatwoot.accessToken,
      account_id: chatwoot.accountId,
      inbox_id: String(inbox.id),
      updated_at: now,
    },
    { onConflict: "user_id" }
  );

  await admin.from("whatsapp_channel_connections").upsert(
    {
      user_id: user.id,
      phone_number: displayPhone,
      phone_number_id: input.phoneNumberId,
      waba_id: input.wabaId,
      chatwoot_inbox_id: String(inbox.id),
      status: "connected",
      connected_at: now,
      last_health_at: now,
      last_error: "",
      updated_at: now,
    },
    { onConflict: "user_id" }
  );

  // Prefill order-confirmation phone number id; leave templates for Settings → WhatsApp.
  await syncWhatsappSettingsPhone(admin, user.id, input.phoneNumberId);

  return {
    ok: true,
    status: "connected" as const,
    phone_number: maskPhone(displayPhone),
    phone_number_id: input.phoneNumberId,
    waba_id: input.wabaId,
    chatwoot_inbox_id: String(inbox.id),
    account_id: chatwoot.accountId,
  };
}

async function getExistingInboxId(
  admin: SupabaseClient,
  userId: string,
  phoneNumberId: string
): Promise<string> {
  const { data } = await admin
    .from("whatsapp_channel_connections")
    .select("chatwoot_inbox_id, phone_number_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (data?.phone_number_id === phoneNumberId && data.chatwoot_inbox_id) {
    return String(data.chatwoot_inbox_id);
  }
  return "";
}

async function getStatusPayload(admin: SupabaseClient, userId: string) {
  const { data } = await admin
    .from("whatsapp_channel_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  const row = data as ConnectionRow | null;
  if (!row || row.status === "disconnected") {
    return {
      status: "disconnected" as const,
      phone_number: "",
      phone_number_id: "",
      waba_id: "",
      chatwoot_inbox_id: "",
      last_error: row?.last_error ?? "",
      config: publicClientConfig(),
    };
  }

  return {
    status: row.status,
    phone_number: maskPhone(row.phone_number),
    phone_number_id: row.phone_number_id,
    waba_id: row.waba_id,
    chatwoot_inbox_id: row.chatwoot_inbox_id,
    connected_at: row.connected_at,
    last_health_at: row.last_health_at,
    last_error: row.last_error,
    config: publicClientConfig(),
  };
}

function publicClientConfig() {
  return {
    meta_app_id: (Deno.env.get("META_APP_ID") ?? Deno.env.get("FB_APP_ID") ?? "").trim(),
    config_id: (Deno.env.get("WA_ES_CONFIG_ID") ?? Deno.env.get("WHATSAPP_CONFIGURATION_ID") ?? "")
      .trim(),
  };
}

async function disconnectWhatsApp(admin: SupabaseClient, userId: string) {
  const { data: conn } = await admin
    .from("whatsapp_channel_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  const { data: settings } = await admin
    .from("chatwoot_settings")
    .select("base_url, access_token, account_id, inbox_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (conn?.chatwoot_inbox_id && settings?.access_token && settings.account_id) {
    try {
      await chatwootFetch(
        settings.base_url,
        settings.access_token,
        `/api/v1/accounts/${settings.account_id}/inboxes/${conn.chatwoot_inbox_id}`,
        { method: "DELETE" }
      );
    } catch (e) {
      console.log(
        JSON.stringify({
          event: "whatsapp_disconnect_inbox_error",
          user_id: userId,
          error: (e as Error).message,
        })
      );
    }
  }

  const now = new Date().toISOString();
  await admin.from("whatsapp_channel_connections").upsert(
    {
      user_id: userId,
      phone_number: "",
      phone_number_id: "",
      waba_id: "",
      chatwoot_inbox_id: "",
      status: "disconnected",
      connected_at: null,
      last_health_at: now,
      last_error: "",
      updated_at: now,
    },
    { onConflict: "user_id" }
  );

  if (settings) {
    const clearInbox =
      !settings.inbox_id ||
      settings.inbox_id === conn?.chatwoot_inbox_id;
    await admin
      .from("chatwoot_settings")
      .update({
        inbox_id: clearInbox ? "" : settings.inbox_id,
        enabled: clearInbox ? false : true,
        updated_at: now,
      })
      .eq("user_id", userId);
  }

  return { ok: true, status: "disconnected" as const };
}

async function healthCheck(admin: SupabaseClient, userId: string) {
  const { data: conn } = await admin
    .from("whatsapp_channel_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (!conn || conn.status === "disconnected" || !conn.chatwoot_inbox_id) {
    return {
      ok: false,
      status: "disconnected" as const,
      error: "WhatsApp is not connected.",
    };
  }

  const { data: settings } = await admin
    .from("chatwoot_settings")
    .select("base_url, access_token, account_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!settings?.access_token || !settings.account_id) {
    await markNeedsReauth(admin, userId, "Chatwoot credentials missing.");
    return {
      ok: false,
      status: "needs_reauth" as const,
      error: "Chatwoot credentials missing. Reconnect WhatsApp.",
    };
  }

  try {
    await chatwootFetch(
      settings.base_url,
      settings.access_token,
      `/api/v1/accounts/${settings.account_id}/inboxes/${conn.chatwoot_inbox_id}`,
      { method: "GET" }
    );
    const now = new Date().toISOString();
    await admin
      .from("whatsapp_channel_connections")
      .update({
        status: "connected",
        last_health_at: now,
        last_error: "",
        updated_at: now,
      })
      .eq("user_id", userId);
    return {
      ok: true,
      status: "connected" as const,
      phone_number: maskPhone(conn.phone_number),
      chatwoot_inbox_id: conn.chatwoot_inbox_id,
    };
  } catch (e) {
    const message = (e as Error).message || "Health check failed";
    const needsReauth = /401|403|unauthorized|token/i.test(message);
    if (needsReauth) {
      await markNeedsReauth(admin, userId, message);
      return { ok: false, status: "needs_reauth" as const, error: message };
    }
    const now = new Date().toISOString();
    await admin
      .from("whatsapp_channel_connections")
      .update({ last_error: message.slice(0, 1024), last_health_at: now, updated_at: now })
      .eq("user_id", userId);
    return { ok: false, status: conn.status, error: message };
  }
}

async function markNeedsReauth(admin: SupabaseClient, userId: string, error: string) {
  const now = new Date().toISOString();
  await admin
    .from("whatsapp_channel_connections")
    .update({
      status: "needs_reauth",
      last_error: error.slice(0, 1024),
      last_health_at: now,
      updated_at: now,
    })
    .eq("user_id", userId);
}

async function syncWhatsappSettingsPhone(
  admin: SupabaseClient,
  userId: string,
  phoneNumberId: string
) {
  const { data: existing } = await admin
    .from("whatsapp_settings")
    .select("user_id, enabled, access_token, template_name, template_language, send_when")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    await admin
      .from("whatsapp_settings")
      .update({
        phone_number_id: phoneNumberId,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
    return;
  }

  await admin.from("whatsapp_settings").insert({
    user_id: userId,
    enabled: false,
    access_token: "",
    phone_number_id: phoneNumberId,
    template_name: "",
    template_language: "en",
    send_when: "create",
    updated_at: new Date().toISOString(),
  });
}

type ChatwootCreds = {
  baseUrl: string;
  accessToken: string;
  accountId: string;
};

async function resolveChatwootCreds(
  admin: SupabaseClient,
  user: { id: string; email?: string | null }
): Promise<ChatwootCreds> {
  // Idempotent: always reuse an existing per-shop Chatwoot account if we already
  // provisioned one (including after disconnect, which clears inbox_id only).
  const { data: settings } = await admin
    .from("chatwoot_settings")
    .select("base_url, access_token, account_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (
    settings?.base_url?.trim() &&
    settings.access_token?.trim() &&
    settings.account_id?.trim()
  ) {
    return {
      baseUrl: normalizeBaseUrl(settings.base_url),
      accessToken: settings.access_token.trim(),
      accountId: settings.account_id.trim(),
    };
  }

  const baseUrl = normalizeBaseUrl(
    Deno.env.get("CHATWOOT_BASE_URL") ??
      Deno.env.get("NEXT_PUBLIC_CHATWOOT_BASE_URL") ??
      ""
  );
  if (!baseUrl) {
    throw new Error(
      "CHATWOOT_BASE_URL is not configured. Set a stable Chatwoot HTTPS URL in Edge secrets."
    );
  }

  const platformToken = (Deno.env.get("CHATWOOT_PLATFORM_TOKEN") ?? "").trim();
  if (platformToken) {
    const provisioned = await provisionChatwootAccount(baseUrl, platformToken, user);
    // Persist immediately so a mid-connect failure does not create duplicate accounts.
    await admin.from("chatwoot_settings").upsert(
      {
        user_id: user.id,
        enabled: false,
        base_url: provisioned.baseUrl,
        access_token: provisioned.accessToken,
        account_id: provisioned.accountId,
        inbox_id: "",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    return provisioned;
  }

  const defaultAccountId = (Deno.env.get("CHATWOOT_DEFAULT_ACCOUNT_ID") ?? "").trim();
  const defaultToken = (Deno.env.get("CHATWOOT_DEFAULT_ACCESS_TOKEN") ?? "").trim();
  if (defaultAccountId && defaultToken) {
    return {
      baseUrl,
      accessToken: defaultToken,
      accountId: defaultAccountId,
    };
  }

  throw new Error(
    "Chatwoot provisioning is not configured. Set CHATWOOT_PLATFORM_TOKEN or CHATWOOT_DEFAULT_ACCOUNT_ID + CHATWOOT_DEFAULT_ACCESS_TOKEN."
  );
}

async function provisionChatwootAccount(
  baseUrl: string,
  platformToken: string,
  user: { id: string; email?: string | null }
): Promise<ChatwootCreds> {
  const name = `Velo ${(user.email ?? user.id).slice(0, 40)}`;
  const accountRes = await fetch(`${baseUrl}/platform/api/v1/accounts`, {
    method: "POST",
    headers: {
      api_access_token: platformToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name }),
  });
  const accountJson = await readJson(accountRes);
  if (!accountRes.ok) {
    throw new Error(describeChatwootError(accountRes.status, accountJson, "create account"));
  }
  const accountId = String(
    (accountJson as { id?: number }).id ??
      (accountJson as { account?: { id?: number } }).account?.id ??
      ""
  );
  if (!/^\d+$/.test(accountId)) {
    throw new Error("Chatwoot Platform API did not return an account id.");
  }

  const email =
    (user.email && user.email.includes("@")
      ? user.email
      : `velo-${user.id.replace(/-/g, "").slice(0, 16)}@users.velo.local`).toLowerCase();
  const password = crypto.randomUUID() + "Aa1!";

  const userRes = await fetch(`${baseUrl}/platform/api/v1/users`, {
    method: "POST",
    headers: {
      api_access_token: platformToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: name.slice(0, 80),
      email,
      password,
      custom_attributes: { velo_user_id: user.id },
    }),
  });
  const userJson = await readJson(userRes);
  if (!userRes.ok) {
    throw new Error(describeChatwootError(userRes.status, userJson, "create user"));
  }
  const platformUserId = String((userJson as { id?: number }).id ?? "");
  if (!/^\d+$/.test(platformUserId)) {
    throw new Error("Chatwoot Platform API did not return a user id.");
  }
  const tokenFromCreate = String(
    (userJson as { access_token?: string }).access_token ?? ""
  ).trim();

  const linkRes = await fetch(
    `${baseUrl}/platform/api/v1/accounts/${accountId}/account_users`,
    {
      method: "POST",
      headers: {
        api_access_token: platformToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ user_id: Number(platformUserId), role: "administrator" }),
    }
  );
  const linkJson = await readJson(linkRes);
  if (!linkRes.ok) {
    throw new Error(describeChatwootError(linkRes.status, linkJson, "link account user"));
  }

  let accessToken = tokenFromCreate;
  const tokenRes = await fetch(
    `${baseUrl}/platform/api/v1/users/${platformUserId}/login`,
    {
      method: "GET",
      headers: { api_access_token: platformToken },
    }
  );
  const tokenJson = await readJson(tokenRes);
  if (tokenRes.ok) {
    accessToken = String(
      (tokenJson as { access_token?: string }).access_token ??
        (tokenJson as { data?: { access_token?: string } }).data?.access_token ??
        accessToken
    ).trim();
  }
  if (!accessToken) {
    throw new Error(
      "Chatwoot Platform login did not return an access token. Create an Agent API token manually or set CHATWOOT_DEFAULT_* secrets."
    );
  }

  return { baseUrl, accessToken, accountId };
}

async function upsertWhatsappInbox(
  chatwoot: ChatwootCreds,
  input: {
    phoneNumber: string;
    phoneNumberId: string;
    wabaId: string;
    apiKey: string;
    webhookVerifyToken: string;
    existingInboxId: string;
  }
): Promise<{ id: number }> {
  const channelPayload = {
    name: `WhatsApp ${input.phoneNumber}`,
    channel: {
      type: "whatsapp",
      phone_number: input.phoneNumber,
      provider: "whatsapp_cloud",
      provider_config: {
        api_key: input.apiKey,
        phone_number_id: input.phoneNumberId,
        business_account_id: input.wabaId,
        webhook_verify_token: input.webhookVerifyToken,
      },
    },
  };

  if (input.existingInboxId && /^\d+$/.test(input.existingInboxId)) {
    // Chatwoot has limited inbox update for provider_config; recreate path preferred via delete+create on reconnect.
    try {
      await chatwootFetch(
        chatwoot.baseUrl,
        chatwoot.accessToken,
        `/api/v1/accounts/${chatwoot.accountId}/inboxes/${input.existingInboxId}`,
        { method: "DELETE" }
      );
    } catch {
      /* continue and create */
    }
  }

  const created = await chatwootFetch(
    chatwoot.baseUrl,
    chatwoot.accessToken,
    `/api/v1/accounts/${chatwoot.accountId}/inboxes`,
    { method: "POST", body: channelPayload }
  );

  const id = Number(
    (created as { id?: number }).id ??
      (created as { payload?: { id?: number } }).payload?.id ??
      0
  );
  if (!id) {
    throw new Error("Chatwoot did not return an inbox id after WhatsApp create.");
  }

  // Ensure current agent is an inbox member.
  try {
    const profile = (await chatwootFetch(
      chatwoot.baseUrl,
      chatwoot.accessToken,
      `/api/v1/profile`,
      { method: "GET" }
    )) as { id?: number };
    if (profile.id) {
      await chatwootFetch(
        chatwoot.baseUrl,
        chatwoot.accessToken,
        `/api/v1/accounts/${chatwoot.accountId}/inbox_members`,
        {
          method: "POST",
          body: { inbox_id: id, user_ids: [profile.id] },
        }
      );
    }
  } catch {
    /* membership may already exist */
  }

  return { id };
}

async function exchangeCodeForToken(
  appId: string,
  appSecret: string,
  code: string
): Promise<string> {
  const url = new URL(`${GRAPH}/oauth/access_token`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("code", code);

  const res = await fetch(url.toString(), { method: "GET" });
  const json = await readJson(res);
  if (!res.ok) {
    throw new Error(describeGraphError(json, "token exchange"));
  }
  const token = String((json as { access_token?: string }).access_token ?? "").trim();
  if (!token) throw new Error("Meta did not return an access token from the signup code.");
  return token;
}

async function subscribeAppToWaba(wabaId: string, token: string) {
  const res = await fetch(`${GRAPH}/${wabaId}/subscribed_apps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await readJson(res);
  if (!res.ok) {
    throw new Error(describeGraphError(json, "WABA subscribe"));
  }
}

async function registerPhoneNumber(phoneNumberId: string, token: string) {
  const res = await fetch(`${GRAPH}/${phoneNumberId}/register`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messaging_product: "whatsapp", pin: "000000" }),
  });
  const json = await readJson(res);
  // Already registered is fine.
  if (!res.ok) {
    const msg = describeGraphError(json, "phone register");
    if (!/already|registered/i.test(msg)) {
      console.log(JSON.stringify({ event: "wa_register_warn", error: msg }));
    }
  }
}

/** Force phone-level webhook to our stable Chatwoot HTTPS host. */
async function overridePhoneWebhook(input: {
  phoneNumberId: string;
  token: string;
  callbackUrl: string;
  verifyToken: string;
}) {
  const res = await fetch(`${GRAPH}/${input.phoneNumberId}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      webhook_configuration: {
        override_callback_uri: input.callbackUrl,
        verify_token: input.verifyToken,
      },
    }),
  });
  const json = await readJson(res);
  if (!res.ok) {
    const msg = describeGraphError(json, "phone webhook override");
    console.log(JSON.stringify({ event: "wa_webhook_override_warn", error: msg }));
    // Non-fatal if app-level webhook already points at Chatwoot; still surface soft fail.
    if (/190|session has expired|invalid.*token|oauth/i.test(msg)) {
      throw new Error(msg);
    }
  }
}

function platformWebhookVerifyToken(): string {
  const explicit = (Deno.env.get("WA_WEBHOOK_VERIFY_TOKEN") ?? "").trim();
  if (explicit) return explicit;
  // Must match Meta WhatsApp app webhook verify token used for Velo_ws.
  return "2ef952bdcaaa3fcee36ea96c5bc8fe60";
}

function isMetaAuthError(message: string): boolean {
  return /190|session has expired|error validating access token|oauthexception|invalid oauth/i.test(
    message
  );
}

async function fetchPhoneInfo(phoneNumberId: string, token: string) {
  const res = await fetch(
    `${GRAPH}/${phoneNumberId}?fields=display_phone_number,verified_name`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const json = (await readJson(res)) as {
    display_phone_number?: string;
    verified_name?: string;
  };
  if (!res.ok) {
    return { display_phone_number: "", verified_name: "" };
  }
  return json;
}

async function chatwootFetch(
  baseUrl: string,
  accessToken: string,
  path: string,
  options: { method: string; body?: Record<string, unknown> }
) {
  const origin = normalizeBaseUrl(baseUrl);
  let res: Response;
  try {
    res = await fetch(`${origin}${path}`, {
      method: options.method,
      headers: {
        api_access_token: accessToken,
        "Content-Type": "application/json",
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (e) {
    throw new Error(
      `Cannot reach Chatwoot at ${origin}. Is the tunnel/domain up? ${(e as Error).message}`
    );
  }
  const json = await readJson(res);
  if (!res.ok) {
    throw new Error(describeChatwootError(res.status, json, path));
  }
  return json;
}

function normalizeBaseUrl(raw: string): string {
  return (raw ?? "").trim().replace(/\/+$/, "");
}

function normalizePhone(raw: string | undefined | null): string {
  const digits = (raw ?? "").replace(/[^\d+]/g, "").trim();
  if (!digits) return "";
  if (digits.startsWith("+")) return digits;
  return `+${digits.replace(/\D/g, "")}`;
}

function maskPhone(phone: string): string {
  const cleaned = (phone ?? "").trim();
  if (cleaned.length <= 4) return cleaned;
  return `${cleaned.slice(0, 3)}••••${cleaned.slice(-4)}`;
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function describeGraphError(payload: unknown, context: string): string {
  if (payload && typeof payload === "object") {
    const err = (payload as { error?: { message?: string } }).error;
    if (err?.message) return `Meta ${context}: ${err.message}`;
  }
  return `Meta ${context} failed`;
}

function describeChatwootError(status: number, payload: unknown, context: string): string {
  if (status === 401 || status === 403) {
    return `Chatwoot rejected the token (${context}). Check CHATWOOT_DEFAULT_ACCESS_TOKEN.`;
  }
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of ["message", "error", "errors"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value;
      if (Array.isArray(value) && value.length) return String(value[0]);
    }
  }
  return `Chatwoot ${context} returned ${status}`;
}

function ok(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function fail(message: string, status = 200) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
