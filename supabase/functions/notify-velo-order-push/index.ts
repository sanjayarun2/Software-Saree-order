import { createClient } from "npm:@supabase/supabase-js@2";
import { JWT } from "npm:google-auth-library@9";

const DEFAULT_SHOP_BASE = "https://sakthi-textiles-shop.vercel.app";
const CHANNEL_ID = "website-new-orders";

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

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
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
              normalizeShopBaseUrl(row.api_base_url ?? DEFAULT_SHOP_BASE) ===
                shopBase
          )
          .map((row) => row.user_id as string)
          .filter(Boolean)
      ),
    ];

    if (!userIds.length) {
      return json({ sent: 0, failed: 0, message: "No Velo users for this shop" });
    }

    const { data: tokenRows, error: tokenError } = await admin
      .from("push_device_tokens")
      .select("token")
      .in("user_id", userIds);

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
      return json({ sent: 0, failed: 0, message: "No registered devices" });
    }

    const fcmJson = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON")?.trim();
    if (!fcmJson) {
      return json({ error: "FCM not configured" }, 503);
    }

    const serviceAccount = JSON.parse(fcmJson) as ServiceAccount;
    const accessToken = await getFcmAccessToken(serviceAccount);

    const title = "New website order";
    const bodyText =
      quantity > 1
        ? `${customerName} · ${quantity} items`
        : itemSummary
          ? `${customerName} · ${itemSummary}`
          : customerName;

    let sent = 0;
    let failed = 0;

    for (const token of tokens) {
      const ok = await sendFcmMessage({
        projectId: serviceAccount.project_id,
        accessToken,
        token,
        title,
        body: bodyText,
        data: {
          route: "/orders/",
          externalOrderId: orderId,
          customerName,
          quantity: String(quantity),
        },
      });
      if (ok) sent++;
      else failed++;
    }

    return json({ sent, failed, orderId });
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

async function getFcmAccessToken(sa: ServiceAccount): Promise<string> {
  const client = new JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
  });
  const creds = await client.authorize();
  if (!creds.access_token) {
    throw new Error("Failed to obtain FCM access token");
  }
  return creds.access_token;
}

async function sendFcmMessage(params: {
  projectId: string;
  accessToken: string;
  token: string;
  title: string;
  body: string;
  data: Record<string, string>;
}): Promise<boolean> {
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${params.projectId}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token: params.token,
          notification: {
            title: params.title,
            body: params.body,
          },
          data: params.data,
          android: {
            priority: "high",
            notification: {
              channel_id: CHANNEL_ID,
              sound: "order_cling",
              default_vibrate_timings: true,
            },
          },
        },
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[FCM] send failed:", res.status, text);
    return false;
  }
  return true;
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
