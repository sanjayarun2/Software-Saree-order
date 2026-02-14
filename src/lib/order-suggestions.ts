import type { Order } from "./db-types";

export interface OrderSuggestions {
  recipients: string[];
  senders: string[];
  bookedBy: string[];
  bookedMobile: string[];
  couriers: string[];
  recipientSenderPairs: Map<string, string[]>;
}

const LIMIT = 20;

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((v) => {
    const t = v?.trim();
    if (!t || seen.has(t)) return false;
    seen.add(t);
    return true;
  }).slice(0, LIMIT);
}

export function buildSuggestionsFromOrders(orders: Order[]): OrderSuggestions {
  const recipients: string[] = [];
  const senders: string[] = [];
  const bookedBy: string[] = [];
  const bookedMobile: string[] = [];
  const couriers: string[] = [];
  const recipientToSenders = new Map<string, Set<string>>();

  for (const o of orders) {
    if (o.recipient_details?.trim()) {
      recipients.push(o.recipient_details.trim());
      if (o.sender_details?.trim()) {
        const rec = o.recipient_details.trim();
        if (!recipientToSenders.has(rec)) recipientToSenders.set(rec, new Set());
        recipientToSenders.get(rec)!.add(o.sender_details.trim());
      }
    }
    if (o.sender_details?.trim()) senders.push(o.sender_details.trim());
    if (o.booked_by?.trim()) bookedBy.push(o.booked_by.trim());
    if (o.booked_mobile_no?.trim()) bookedMobile.push(o.booked_mobile_no.trim());
    if (o.courier_name?.trim()) couriers.push(o.courier_name.trim());
  }

  const recipientSenderPairs = new Map<string, string[]>();
  recipientToSenders.forEach((sendersSet, rec) => {
    recipientSenderPairs.set(rec, Array.from(sendersSet).slice(0, 5));
  });

  return {
    recipients: uniqueNonEmpty(recipients),
    senders: uniqueNonEmpty(senders),
    bookedBy: uniqueNonEmpty(bookedBy),
    bookedMobile: uniqueNonEmpty(bookedMobile),
    couriers: uniqueNonEmpty(couriers),
    recipientSenderPairs,
  };
}
