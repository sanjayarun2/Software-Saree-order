import { createClient } from "npm:@supabase/supabase-js@2";
import {
  fetchVeloOrdersFromShop,
  isPaidVeloOrder,
  isRecentEnoughForPush,
  orderCreatedAtIso,
  orderQuantity,
  resolveExternalOrderId,
  type VeloOrderRow,
} from "./_shared/velo-api.ts";
import {
  sendFcmToTokens,
  type ServiceAccount,
} from "./_shared/fcm.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-velo-push-secret",
};

/** Only push for orders paid within this window (avoids old-order burst on first poll). */
const PUSH_MAX_AGE_MS = 30 * 60 * 1000;
const DEFAULT_LOOKBACK_MS = 15 * 60 * 1000;
const POLL_OVERLAP_MS = 3 * 60 * 1000;

type IntegrationRow = {
  id: string;
  user_id: string;
  api_key: string;
  api_base_url: string;
  last_push_poll_at: string | null;
  label: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    if (!isAuthorized(req)) {
      return json({ error: "Unauthorized" }, 401);
    }

    const fcmJson = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON")?.trim();
    if (!fcmJson) {
      return json({ error: "FCM not configured" }, 503);
    }
    const serviceAccount = JSON.parse(fcmJson) as ServiceAccount;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: integrations, error: intError } = await admin
      .from("api_integrations")
      .select("id, user_id, api_key, api_base_url, last_push_poll_at, label")
      .eq("enabled", true);

    if (intError) {
      return json({ error: intError.message }, 500);
    }

    const rows = ((integrations ?? []) as IntegrationRow[]).filter(
      (row) => row.api_key?.trim().length > 0
    );

    if (!rows.length) {
      return json({ polled: 0, pushed: 0, message: "No enabled API integrations" });
    }

    const userIds = [...new Set(rows.map((r) => r.user_id))];
    const { data: tokenRows, error: tokenError } = await admin
      .from("push_device_tokens")
      .select("user_id, token")
      .in("user_id", userIds);

    if (tokenError) {
      return json({ error: tokenError.message }, 500);
    }

    const tokensByUser = new Map<string, string[]>();
    for (const row of tokenRows ?? []) {
      const uid = row.user_id as string;
      const token = (row.token as string)?.trim();
      if (!uid || !token) continue;
      const list = tokensByUser.get(uid) ?? [];
      if (!list.includes(token)) list.push(token);
      tokensByUser.set(uid, list);
    }

    let polled = 0;
    let pushed = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const integration of rows) {
      const tokens = tokensByUser.get(integration.user_id) ?? [];
      if (!tokens.length) {
        skipped++;
        continue;
      }

      polled++;

      const since = integration.last_push_poll_at
        ? new Date(
            new Date(integration.last_push_poll_at).getTime() - POLL_OVERLAP_MS
          ).toISOString()
        : new Date(Date.now() - DEFAULT_LOOKBACK_MS).toISOString();

      try {
        const data = await fetchVeloOrdersFromShop({
          apiKey: integration.api_key,
          apiBaseUrl: integration.api_base_url,
          since,
          limit: 50,
        });

        const orders = Array.isArray(data.orders) ? data.orders : [];
        let integrationPushed = 0;

        for (const raw of orders) {
          const pushedOne = await maybePushOrder(admin, serviceAccount, {
            userId: integration.user_id,
            tokens,
            order: raw,
          });
          if (pushedOne) {
            pushed++;
            integrationPushed++;
          }
        }

        await admin
          .from("api_integrations")
          .update({
            last_push_poll_at: new Date().toISOString(),
            last_error: null,
          })
          .eq("id", integration.id);

        if (integrationPushed > 0) {
          console.log(
            `[poll-push] ${integration.label}: pushed ${integrationPushed} for user ${integration.user_id}`
          );
        }
      } catch (e) {
        const msg = (e as Error).message || "Poll failed";
        errors.push(`${integration.label}: ${msg}`);
        await admin
          .from("api_integrations")
          .update({
            last_error: msg.slice(0, 500),
          })
          .eq("id", integration.id);
      }
    }

    return json({
      polled,
      pushed,
      skipped,
      errors,
    });
  } catch (e) {
    return json({ error: (e as Error).message || "Poll push failed" }, 500);
  }
});

async function maybePushOrder(
  admin: ReturnType<typeof createClient>,
  serviceAccount: ServiceAccount,
  params: { userId: string; tokens: string[]; order: VeloOrderRow }
): Promise<boolean> {
  const externalId = resolveExternalOrderId(params.order);
  if (!externalId) return false;
  if (!isPaidVeloOrder(params.order)) return false;

  const createdAt = orderCreatedAtIso(params.order);
  if (!isRecentEnoughForPush(createdAt, PUSH_MAX_AGE_MS)) return false;

  const { data: existing } = await admin
    .from("push_notified_orders")
    .select("id")
    .eq("user_id", params.userId)
    .eq("external_order_id", externalId)
    .maybeSingle();

  if (existing?.id) return false;

  const customerName = params.order.customer?.name?.trim() || "Customer";
  const quantity = orderQuantity(params.order);

  const { sent } = await sendFcmToTokens(
    serviceAccount,
    params.tokens,
    { externalOrderId: externalId, customerName, quantity }
  );

  if (sent <= 0) return false;

  const { error: insErr } = await admin.from("push_notified_orders").insert({
    user_id: params.userId,
    external_order_id: externalId,
  });

  if (insErr && !/duplicate|unique|23505/i.test(insErr.message)) {
    console.warn("[poll-push] dedupe insert failed:", insErr.message);
  }

  return true;
}

function isAuthorized(req: Request): boolean {
  const expected = Deno.env.get("VELO_PUSH_WEBHOOK_SECRET")?.trim() ?? "";
  const secret = req.headers.get("x-velo-push-secret")?.trim() ?? "";
  if (expected && secret === expected) return true;

  // Supabase scheduled cron invokes with service role Authorization.
  const auth = req.headers.get("authorization")?.trim() ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? "";
  if (serviceKey && auth === `Bearer ${serviceKey}`) return true;

  return false;
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
