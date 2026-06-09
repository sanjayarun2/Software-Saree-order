import { createStore, get, set } from "idb-keyval";
import type { VeloBulkSharedForm } from "./velo-products-types";
import { deleteBulkProductBatchImages } from "./bulk-product-batch-images";

const store = createStore("saree-bulk-product-batches", "v1");

const BATCH_CAP = 50;

export type BulkProductBatchLine = {
  code: string;
  qty: number;
  productName: string;
  /** Shop ST code after successful website upload. */
  websiteCode?: string;
};

export type BulkProductBatchUploadStatus =
  | "pending"
  | "uploading"
  | "done"
  | "partial"
  | "failed";

export type BulkProductBatchPrepStatus =
  | "pending"
  | "preparing"
  | "ready"
  | "failed";

export type BulkProductBatchRecord = {
  id: string;
  firstCode: string;
  lastCode: string;
  count: number;
  createdAt: string;
  lines?: BulkProductBatchLine[];
  form: VeloBulkSharedForm;
  uploadStatus: BulkProductBatchUploadStatus;
  /** WebP upload payloads prepared in background (separate from share images). */
  prepStatus?: BulkProductBatchPrepStatus;
  prepReadyCount?: number;
  prepError?: string;
  uploadedCount?: number;
  websiteCodes?: string[];
  uploadError?: string;
};

function batchesKey(userId: string): string {
  return `bulk-batches:${userId}`;
}

export async function getBulkProductBatches(userId: string): Promise<BulkProductBatchRecord[]> {
  if (typeof window === "undefined") return [];
  const list = await get<BulkProductBatchRecord[]>(batchesKey(userId), store);
  return Array.isArray(list) ? list : [];
}

export async function prependBulkProductBatch(
  userId: string,
  batch: BulkProductBatchRecord
): Promise<void> {
  const prev = await getBulkProductBatches(userId);
  const next = [batch, ...prev].slice(0, BATCH_CAP);
  await set(batchesKey(userId), next, store);
}

export async function updateBulkProductBatch(
  userId: string,
  batchId: string,
  patch: Partial<BulkProductBatchRecord>
): Promise<BulkProductBatchRecord | null> {
  const prev = await getBulkProductBatches(userId);
  let updated: BulkProductBatchRecord | null = null;
  const next = prev.map((b) => {
    if (b.id !== batchId) return b;
    updated = { ...b, ...patch };
    return updated;
  });
  await set(batchesKey(userId), next, store);
  return updated;
}

export async function deleteBulkProductBatch(userId: string, batchId: string): Promise<void> {
  const prev = await getBulkProductBatches(userId);
  const next = prev.filter((b) => b.id !== batchId);
  await set(batchesKey(userId), next, store);
  await deleteBulkProductBatchImages(userId, batchId);
}

export function batchQtyTotal(batch: BulkProductBatchRecord): number {
  const fromLines = batch.lines?.reduce((s, l) => s + l.qty, 0);
  return fromLines != null && fromLines > 0 ? fromLines : batch.count;
}
