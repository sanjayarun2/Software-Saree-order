import { createStore, get, set } from "idb-keyval";
import { buildProductCode } from "./product-code-utils";

const store = createStore("saree-product-codes", "v1");

const BATCH_CAP = 50;

export type ProductCodeBatchLine = {
  code: string;
  qty: number;
};

export type ProductCodeBatchRecord = {
  id: string;
  firstCode: string;
  lastCode: string;
  count: number;
  createdAt: string;
  /** Per-row quantity when saved from the review screen */
  lines?: ProductCodeBatchLine[];
};

function batchesKey(userId: string): string {
  return `batches:${userId}`;
}

function counterKey(userId: string, dayYyyyMmDd: string): string {
  return `ctr:${userId}:${dayYyyyMmDd}`;
}

export async function getProductCodeBatches(userId: string): Promise<ProductCodeBatchRecord[]> {
  if (typeof window === "undefined") return [];
  const list = await get<ProductCodeBatchRecord[]>(batchesKey(userId), store);
  return Array.isArray(list) ? list : [];
}

export async function prependProductCodeBatch(userId: string, batch: ProductCodeBatchRecord): Promise<void> {
  const prev = await getProductCodeBatches(userId);
  const next = [batch, ...prev].slice(0, BATCH_CAP);
  await set(batchesKey(userId), next, store);
}

/**
 * Reserve `count` sequential sequence numbers for anchor day; returns starting seq and full codes.
 */
export async function reserveCodesForDay(
  userId: string,
  dayYyyyMmDd: string,
  userPrefix: string,
  anchor: Date,
  count: number
): Promise<{ codes: string[]; startSeq: number; nextSeq: number }> {
  const k = counterKey(userId, dayYyyyMmDd);
  const raw = await get<number>(k, store);
  const startSeq = typeof raw === "number" && raw >= 1 ? raw : 1;
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    codes.push(buildProductCode(userPrefix, anchor, startSeq + i));
  }
  const nextSeq = startSeq + count;
  await set(k, nextSeq, store);
  return { codes, startSeq, nextSeq };
}
