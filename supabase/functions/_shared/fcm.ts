import { JWT } from "npm:google-auth-library@9";

const CHANNEL_ID = "website-new-orders";

export type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

export type FcmOrderPayload = {
  externalOrderId: string;
  customerName: string;
  quantity: number;
  itemSummary?: string;
};

export async function getFcmAccessToken(sa: ServiceAccount): Promise<string> {
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

export async function sendFcmToToken(params: {
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

export function formatPushBody(order: FcmOrderPayload): string {
  const name = order.customerName.trim() || "Customer";
  const qty = order.quantity >= 1 ? Math.floor(order.quantity) : 1;
  if (qty > 1) return `${name} · ${qty} items`;
  if (order.itemSummary?.trim()) return `${name} · ${order.itemSummary.trim()}`;
  return name;
}

export async function sendFcmToTokens(
  serviceAccount: ServiceAccount,
  tokens: string[],
  order: FcmOrderPayload
): Promise<{ sent: number; failed: number }> {
  if (!tokens.length) return { sent: 0, failed: 0 };

  const accessToken = await getFcmAccessToken(serviceAccount);
  const title = "New website order";
  const body = formatPushBody(order);
  const data = {
    route: "/orders/",
    externalOrderId: order.externalOrderId,
    customerName: order.customerName,
    quantity: String(order.quantity),
  };

  let sent = 0;
  let failed = 0;
  for (const token of tokens) {
    const ok = await sendFcmToToken({
      projectId: serviceAccount.project_id,
      accessToken,
      token,
      title,
      body,
      data,
    });
    if (ok) sent++;
    else failed++;
  }
  return { sent, failed };
}
