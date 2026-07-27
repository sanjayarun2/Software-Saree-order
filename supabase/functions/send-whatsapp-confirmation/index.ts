import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GRAPH_VERSION = "v21.0";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function digitsOnly(raw: string | null | undefined): string {
  return String(raw ?? "").replace(/\D/g, "");
}

function toWhatsAppMobile(raw: string | null | undefined): string | null {
  const digits = digitsOnly(raw);
  if (!digits || digits.length < 8) return null;
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.startsWith("0") && digits.length === 11) return `91${digits.slice(1)}`;
  return digits;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser();
    if (userError || !user) return json({ error: "Unauthorized" }, 401);

    const body = (await req.json()) as {
      trigger?: string;
      order_id?: string | null;
      mobile?: string;
      customer_name?: string;
      body_text?: string;
    };

    const trigger = body.trigger === "despatch" ? "despatch" : "create";

    const { data: settings, error: settingsError } = await supabaseUser
      .from("whatsapp_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (settingsError) {
      return json({ error: settingsError.message }, 500);
    }
    if (!settings?.enabled) {
      return json({ skipped: true, reason: "disabled" });
    }
    if (settings.send_when !== trigger) {
      return json({ skipped: true, reason: "trigger_mismatch" });
    }

    const token = String(settings.access_token ?? "").trim();
    const phoneNumberId = String(settings.phone_number_id ?? "").trim();
    const templateName = String(settings.template_name ?? "").trim();
    const language = String(settings.template_language ?? "en").trim() || "en";

    if (!token || !phoneNumberId || !templateName) {
      return json({ skipped: true, reason: "incomplete_settings" });
    }

    let mobile = toWhatsAppMobile(body.mobile);
    let customerName = String(body.customer_name ?? "").trim();
    let bodyText = String(body.body_text ?? "").trim();

    const orderId = body.order_id?.trim() || "";
    if (orderId && !orderId.startsWith("temp_")) {
      const { data: order, error: orderError } = await supabaseUser
        .from("orders")
        .select("id, booked_mobile_no, recipient_details, booked_by, quantity, external_order_id")
        .eq("id", orderId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (orderError) {
        return json({ error: orderError.message }, 500);
      }
      if (!order) {
        return json({ error: "Order not found" }, 404);
      }

      mobile = toWhatsAppMobile(order.booked_mobile_no) ?? mobile;
      if (!customerName) {
        const line = String(order.recipient_details ?? "").split(/\r?\n/)[0]?.trim() || "";
        customerName = line || String(order.booked_by ?? "").trim() || "Customer";
      }
      if (!bodyText) {
        const qty =
          order.quantity != null && Number(order.quantity) >= 1
            ? String(Number(order.quantity))
            : "1";
        const ext = String(order.external_order_id ?? "").trim();
        bodyText = ext
          ? `Order ${ext} · Qty ${qty}`
          : `Order ${String(order.id).slice(0, 8)} · Qty ${qty}`;
      }
    }

    if (!mobile) {
      return json({ skipped: true, reason: "no_mobile" });
    }
    if (!customerName) customerName = "Customer";
    if (!bodyText) bodyText = customerName;

    // Single body variable templates: {{1}} = short order summary (or customer name).
    const templatePayload = {
      messaging_product: "whatsapp",
      to: mobile,
      type: "template",
      template: {
        name: templateName,
        language: { code: language },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: bodyText.slice(0, 1024) },
            ],
          },
        ],
      },
    };

    const graphUrl =
      `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(phoneNumberId)}/messages`;

    const graphRes = await fetch(graphUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(templatePayload),
    });

    const graphJson = await graphRes.json().catch(() => ({}));
    if (!graphRes.ok) {
      console.error("[send-whatsapp-confirmation] Meta error:", graphJson);
      return json(
        {
          error: "WhatsApp API error",
          details: graphJson,
        },
        502
      );
    }

    return json({ ok: true, to: mobile, result: graphJson });
  } catch (e) {
    console.error("[send-whatsapp-confirmation]", e);
    return json({ error: (e as Error).message || "Failed" }, 500);
  }
});
