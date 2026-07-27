import { supabase } from "./supabase";
import {
  getWhatsAppSettings,
  type WhatsAppSendWhen,
} from "./whatsapp-settings-supabase";
import { mobileToWhatsAppDigits } from "./unpaid-offer";
import type { Order } from "./db-types";

export type WhatsAppConfirmTrigger = WhatsAppSendWhen;

function customerNameFromOrder(order: Pick<Order, "recipient_details" | "booked_by">): string {
  const fromTo = (order.recipient_details || "").split(/\r?\n/)[0]?.trim() || "";
  if (fromTo) return fromTo;
  return (order.booked_by || "").trim() || "Customer";
}

function summaryFromOrder(order: Pick<Order, "quantity" | "external_order_id" | "id">): string {
  const qty =
    order.quantity != null && Number(order.quantity) >= 1
      ? String(Number(order.quantity))
      : "1";
  const ext = (order.external_order_id || "").trim();
  if (ext) return `Order ${ext} · Qty ${qty}`;
  const shortId = order.id.startsWith("temp_") ? "new" : order.id.slice(0, 8);
  return `Order ${shortId} · Qty ${qty}`;
}

/**
 * Fire-and-forget WhatsApp template confirmation when settings match the trigger.
 * Never throws to callers — failures are logged only.
 */
export async function maybeSendWhatsAppConfirmation(
  userId: string,
  trigger: WhatsAppConfirmTrigger,
  order: Pick<
    Order,
    | "id"
    | "booked_mobile_no"
    | "recipient_details"
    | "booked_by"
    | "quantity"
    | "external_order_id"
  >
): Promise<void> {
  try {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;

    const settings = await getWhatsAppSettings(userId);
    if (!settings?.enabled) return;
    if (settings.send_when !== trigger) return;
    if (!settings.access_token.trim() || !settings.phone_number_id.trim()) return;
    if (!settings.template_name.trim()) return;

    const mobile = mobileToWhatsAppDigits(order.booked_mobile_no);
    if (!mobile) {
      console.warn("[WhatsApp] skip: no valid mobile on order", order.id);
      return;
    }

    const { error } = await supabase.functions.invoke("send-whatsapp-confirmation", {
      body: {
        trigger,
        order_id: order.id.startsWith("temp_") ? null : order.id,
        mobile,
        customer_name: customerNameFromOrder(order),
        body_text: summaryFromOrder(order),
      },
    });

    if (error) {
      console.warn("[WhatsApp] send failed:", error.message);
    }
  } catch (e) {
    console.warn("[WhatsApp] send error:", e);
  }
}
