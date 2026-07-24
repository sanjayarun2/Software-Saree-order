import { createClient } from "npm:@supabase/supabase-js@2";

const DEFAULT_BASE = "https://sakthi-textiles-shop.vercel.app";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_PAYMENT_STATUSES = new Set([
  "paid",
  "unpaid",
  "no_payment_required",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Unauthorized" }, 401);
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
      return json({ error: "Unauthorized" }, 401);
    }

    const body = (await req.json()) as {
      integration_id?: string;
      since?: string;
      limit?: number;
      /** Single order id → GET /api/velo/orders/:orderId */
      order_id?: string;
      /** Optional: paid | unpaid | no_payment_required */
      payment_status?: string;
      /** Optional: asc (default) | desc */
      sort?: string;
      /** Optional upper bound ISO for sort=desc pagination */
      before?: string;
      test_only?: boolean;
      api_key?: string;
      api_base_url?: string;
    };

    let apiKey = "";
    let apiBaseUrl = DEFAULT_BASE;

    if (body.integration_id) {
      const admin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );

      const { data: integration, error: intError } = await admin
        .from("api_integrations")
        .select("api_key, api_base_url, user_id, enabled")
        .eq("id", body.integration_id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (intError || !integration) {
        return json({ error: "API integration not found" }, 404);
      }

      apiKey = integration.api_key?.trim() ?? "";
      apiBaseUrl = integration.api_base_url?.trim() || DEFAULT_BASE;
    } else {
      apiKey = body.api_key?.trim() ?? "";
      apiBaseUrl = body.api_base_url?.trim() || DEFAULT_BASE;
    }

    if (!apiKey) {
      return json({ error: "API key is required" }, 400);
    }

    const base = apiBaseUrl.replace(/\/$/, "");
    const orderId = body.order_id?.trim() || "";
    const paymentStatus = body.payment_status?.trim().toLowerCase() || "";
    if (paymentStatus && !ALLOWED_PAYMENT_STATUSES.has(paymentStatus)) {
      return json(
        {
          error:
            "Invalid payment_status. Use paid, unpaid, or no_payment_required.",
        },
        400
      );
    }

    const sort = body.sort?.trim().toLowerCase() === "desc" ? "desc" : "";
    const before = body.before?.trim() || "";
    if (before && Number.isNaN(Date.parse(before))) {
      return json({ error: "Invalid before. Use ISO datetime." }, 400);
    }

    let url: string;
    if (orderId) {
      url = `${base}/api/velo/orders/${encodeURIComponent(orderId)}`;
    } else {
      const params = new URLSearchParams({
        since: body.since || new Date(0).toISOString(),
        limit: String(Math.min(Math.max(body.limit ?? 50, 1), 200)),
      });
      if (paymentStatus) params.set("paymentStatus", paymentStatus);
      if (sort) params.set("sort", sort);
      if (before) params.set("before", before);
      url = `${base}/api/velo/orders?${params.toString()}`;
    }

    const veloRes = await fetch(url, {
      headers: { "x-velo-key": apiKey },
      cache: "no-store",
    });

    const text = await veloRes.text();
    let payload: unknown = text;
    try {
      payload = JSON.parse(text);
    } catch {
      /* keep raw text */
    }

    if (!veloRes.ok) {
      const message =
        typeof payload === "object" && payload && "message" in payload
          ? String((payload as { message: string }).message)
          : `Velo API returned ${veloRes.status}`;
      return json({ error: message }, veloRes.status);
    }

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return json({ error: (e as Error).message || "Proxy failed" }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
