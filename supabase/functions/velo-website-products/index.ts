import { createClient } from "npm:@supabase/supabase-js@2";

const DEFAULT_BASE = "https://sakthi-textiles-shop.vercel.app";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ ok: false, error: "Unauthorized" }, 401);
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
      return json({ ok: false, error: "Unauthorized" }, 401);
    }

    const body = (await req.json()) as {
      integration_id?: string;
      api_key?: string;
      api_base_url?: string;
      action?: string;
      requestId?: string;
      data?: Record<string, unknown>;
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
        return json({ ok: false, error: "API integration not found" }, 404);
      }

      apiKey = integration.api_key?.trim() ?? "";
      apiBaseUrl = integration.api_base_url?.trim() || DEFAULT_BASE;
    } else {
      apiKey = body.api_key?.trim() ?? "";
      apiBaseUrl = body.api_base_url?.trim() || DEFAULT_BASE;
    }

    if (!apiKey) {
      return json({ ok: false, error: "API key is required" }, 400);
    }

    if (!body.action || !body.requestId) {
      return json({ ok: false, error: "action and requestId are required" }, 400);
    }

    const base = apiBaseUrl.replace(/\/$/, "");
    const url = `${base}/api/velo/products`;

    const veloRes = await fetch(url, {
      method: "POST",
      headers: {
        "x-velo-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: body.action,
        requestId: body.requestId,
        data: body.data ?? {},
      }),
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
      // Always HTTP 200 so supabase.functions.invoke returns the real error body.
      return new Response(
        JSON.stringify({
          ok: false,
          error: message,
          details: payload,
          requestId: body.requestId,
          action: body.action,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message || "Proxy failed" }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
