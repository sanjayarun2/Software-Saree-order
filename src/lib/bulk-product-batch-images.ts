import { createStore, get, set, del } from "idb-keyval";

const imgStore = createStore("saree-bulk-product-batch-img", "v1");

export type StoredBulkBatchImage = {
  code: string;
  mime: string;
  /** Raw base64 without data: URL prefix — share/download quality */
  dataBase64: string;
};

/** Pre-compressed WebP (or JPEG fallback) for website upload only. */
export type StoredBulkBatchUploadImage = {
  code: string;
  mime: string;
  fileName: string;
  dataBase64: string;
};

function shareKey(userId: string, batchId: string): string {
  return `bulk-share:${userId}:${batchId}`;
}

function uploadKey(userId: string, batchId: string): string {
  return `bulk-upload:${userId}:${batchId}`;
}

export async function putBulkProductBatchImages(
  userId: string,
  batchId: string,
  images: StoredBulkBatchImage[]
): Promise<void> {
  if (typeof window === "undefined") return;
  await set(shareKey(userId, batchId), images, imgStore);
}

export async function getBulkProductBatchImages(
  userId: string,
  batchId: string
): Promise<StoredBulkBatchImage[]> {
  if (typeof window === "undefined") return [];
  const v = await get<StoredBulkBatchImage[]>(shareKey(userId, batchId), imgStore);
  if (Array.isArray(v)) return v;
  // Legacy key migration
  const legacy = await get<StoredBulkBatchImage[]>(`bulk-img:${userId}:${batchId}`, imgStore);
  return Array.isArray(legacy) ? legacy : [];
}

export async function putBulkProductBatchUploadImages(
  userId: string,
  batchId: string,
  images: StoredBulkBatchUploadImage[]
): Promise<void> {
  if (typeof window === "undefined") return;
  await set(uploadKey(userId, batchId), images, imgStore);
}

export async function getBulkProductBatchUploadImages(
  userId: string,
  batchId: string
): Promise<StoredBulkBatchUploadImage[]> {
  if (typeof window === "undefined") return [];
  const v = await get<StoredBulkBatchUploadImage[]>(uploadKey(userId, batchId), imgStore);
  return Array.isArray(v) ? v : [];
}

export async function deleteBulkProductBatchImages(userId: string, batchId: string): Promise<void> {
  if (typeof window === "undefined") return;
  await del(shareKey(userId, batchId), imgStore);
  await del(uploadKey(userId, batchId), imgStore);
  await del(`bulk-img:${userId}:${batchId}`, imgStore);
}

export { storedImageToBlob, blobToBase64Payload } from "./product-code-batch-images";
