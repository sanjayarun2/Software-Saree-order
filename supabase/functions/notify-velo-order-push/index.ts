import { createClient } from "npm:@supabase/supabase-js@2";
import {
  sendFcmToTokens,
  type ServiceAccount,
} from "./_shared/fcm.ts";

const DEFAULT_SHOP_BASE = "https://sakthi-textiles-shop.vercel.app";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-velo-push-secret",
};

type PushRequest = {
  shopBaseUrl?: string;
  orderId?: string;
  customerName?: string;
  quantity?: number;
  itemSummary?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const secret = req.headers.get("x-velo-push-secret")?.trim() ?? "";
    const expected = Deno.env.get("VELO_PUSH_WEBHOOK_SECRET")?.trim() ?? "";
    if (!expected || secret !== expected) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = (await req.json()) as PushRequest;
    const orderId = body.orderId?.trim();
    if (!orderId) {
      return json({ error: "orderId is required" }, 400);
    }

    const shopBase = normalizeShopBaseUrl(body.shopBaseUrl ?? DEFAULT_SHOP_BASE);
    const customerName = body.customerName?.trim() || "Customer";
    const quantity =
      typeof body.quantity === "number" && body.quantity >= 1
        ? Math.floor(body.quantity)
        : 1;
    const itemSummary = body.itemSummary?.trim() || "";

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: integrations, error: intError } = await admin
      .from("api_integrations")
      .select("user_id, api_base_url, enabled")
      .eq("enabled", true);

    if (intError) {
      return json({ error: intError.message }, 500);
    }

    const userIds = [
      ...new Set(
        (integrations ?? [])
          .filter(
            (row) =>
              row.enabled !== false &&
              normalizeShopBaseUrl(row.api_base_url ?? DEFAULT_SHOP_BASE) === shopBase
          )
          .map((row) => row.user_id as string)
          .filter(Boolean)
      ),
    ];

    if (!userIds.length) {
      return json({ sent: 0, failed: 0, message: "No Velo users for this shop" });
    }

    const fcmJson = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON")?.trim();
    if (!fcmJson) {
      return json({ error: "FCM not configured" }, 503);
    }
    const serviceAccount = JSON.parse(fcmJson) as ServiceAccount;

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const userId of userIds) {
      const { data: existing } = await admin
        .from("push_notified_orders")
        .select("id")
        .eq("user_id", userId)
        .eq("external_order_id", orderId)
        .maybeSingle();

      if (existing?.id) {
        skipped++;
        continue;
      }

      const { data: tokenRows, error: tokenError } = await admin
        .from("push_device_tokens")
        .select("token")
        .eq("user_id", userId);

      if (tokenError) {
        return json({ error: tokenError.message }, 500);
      }

      const tokens = [
        ...new Set(
          (tokenRows ?? [])
            .map((row) => (row.token as string)?.trim())
            .filter(Boolean)
        ),
      ];

      if (!tokens.length) {
        continue;
      }

      const result = await sendFcmToTokens(serviceAccount, tokens, {
        externalOrderId: orderId,
        customerName,
        quantity,
        itemSummary,
      });

      sent += result.sent;
      failed += result.failed;

      if (result.sent > 0) {
        await admin.from("push_notified_orders").insert({
          user_id: userId,
          external_order_id: orderId,
        });
      }
    }

    if (sent === 0 && failed === 0 && skipped === 0) {
      return json({ sent: 0, failed: 0, message: "No registered devices" });
    }

    return json({ sent, failed, skipped, orderId });
  } catch (e) {
    return json({ error: (e as Error).message || "Push failed" }, 500);
  }
});

function normalizeShopBaseUrl(input: string): string {
  let raw = (input || "").trim() || DEFAULT_SHOP_BASE;
  if (!/^https?:\/\//i.test(raw)) {
    raw = `https://${raw.replace(/^\/+/, "")}`;
  }
  try {
    const url = new URL(raw);
    const path = url.pathname.replace(/\/+$/, "");
    return `${url.origin}${path}`;
  } catch {
    return DEFAULT_SHOP_BASE;
  }
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
