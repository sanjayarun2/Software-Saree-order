import { createStore, get, set, del } from "idb-keyval";

const imgStore = createStore("saree-bulk-product-batch-img", "v1");

export type StoredBulkBatchImage = {
  code: string;
  mime: string;
  /** Raw base64 without data: URL prefix */
  dataBase64: string;
};

function imgKey(userId: string, batchId: string): string {
  return `bulk-img:${userId}:${batchId}`;
}

export async function putBulkProductBatchImages(
  userId: string,
  batchId: string,
  images: StoredBulkBatchImage[]
): Promise<void> {
  if (typeof window === "undefined") return;
  await set(imgKey(userId, batchId), images, imgStore);
}

export async function getBulkProductBatchImages(
  userId: string,
  batchId: string
): Promise<StoredBulkBatchImage[]> {
  if (typeof window === "undefined") return [];
  const v = await get<StoredBulkBatchImage[]>(imgKey(userId, batchId), imgStore);
  return Array.isArray(v) ? v : [];
}

export async function deleteBulkProductBatchImages(userId: string, batchId: string): Promise<void> {
  if (typeof window === "undefined") return;
  await del(imgKey(userId, batchId), imgStore);
}

export { storedImageToBlob, blobToBase64Payload } from "./product-code-batch-images";
