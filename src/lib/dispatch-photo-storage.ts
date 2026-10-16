/**
 * Optional dispatch proof photo (local only).
 * Does not change barcode / tracking sync — kept separate from orders outbox.
 */

import { get, set, del, createStore } from "idb-keyval";

const store = createStore("saree-dispatch-photos", "v1");

export type DispatchPhotoRecord = {
  orderId: string;
  userId: string;
  mime: string;
  /** Raw base64 (no data: prefix). */
  base64: string;
  createdAt: string;
};

function photoKey(userId: string, orderId: string): string {
  return `${userId}:${orderId}`;
}

export function dispatchPhotoDataUrl(record: DispatchPhotoRecord): string {
  const mime = record.mime || "image/jpeg";
  return `data:${mime};base64,${record.base64}`;
}

export async function saveDispatchPhoto(
  userId: string,
  orderId: string,
  opts: { base64: string; mime?: string }
): Promise<void> {
  const raw = opts.base64.replace(/^data:[^;]+;base64,/, "").trim();
  if (!raw) throw new Error("Photo is empty.");
  const record: DispatchPhotoRecord = {
    orderId,
    userId,
    mime: opts.mime || "image/jpeg",
    base64: raw,
    createdAt: new Date().toISOString(),
  };
  await set(photoKey(userId, orderId), record, store);
}

export async function getDispatchPhoto(
  userId: string,
  orderId: string
): Promise<DispatchPhotoRecord | null> {
  return (await get<DispatchPhotoRecord>(photoKey(userId, orderId), store)) ?? null;
}

export async function deleteDispatchPhoto(
  userId: string,
  orderId: string
): Promise<void> {
  await del(photoKey(userId, orderId), store);
}
