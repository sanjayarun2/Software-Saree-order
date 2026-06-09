import {
  BULK_UPLOAD_PROFILE,
  compressImageFile,
} from "./product-image-compress";
import { gcPause } from "./image-product-code";
import {
  getBulkProductBatchImages,
  putBulkProductBatchUploadImages,
  storedImageToBlob,
  type StoredBulkBatchUploadImage,
} from "./bulk-product-batch-images";
import { updateBulkProductBatch } from "./bulk-product-batch-storage";

export type BulkBatchPrepProgress = {
  current: number;
  total: number;
  percent: number;
  label: string;
};

const inflight = new Map<string, Promise<void>>();

/**
 * Pre-compress stamped share images to WebP upload payloads (background job).
 * Share images in storage are never modified.
 */
export async function prepareBulkBatchForUpload(
  userId: string,
  batchId: string,
  opts?: { onProgress?: (p: BulkBatchPrepProgress) => void }
): Promise<void> {
  const key = `${userId}:${batchId}`;
  const existing = inflight.get(key);
  if (existing) return existing;

  const job = (async () => {
    const shareImages = await getBulkProductBatchImages(userId, batchId);
    if (!shareImages.length) {
      await updateBulkProductBatch(userId, batchId, {
        prepStatus: "failed",
        prepError: "No share images found for this batch.",
      });
      return;
    }

    await updateBulkProductBatch(userId, batchId, {
      prepStatus: "preparing",
      prepReadyCount: 0,
      prepError: undefined,
    });

    const uploadRows: StoredBulkBatchUploadImage[] = [];
    const total = shareImages.length;

    for (let i = 0; i < total; i++) {
      const share = shareImages[i]!;
      opts?.onProgress?.({
        current: i + 1,
        total,
        percent: Math.round(((i + 0.5) / total) * 100),
        label: `Preparing upload ${i + 1}/${total}`,
      });

      try {
        const blob = storedImageToBlob(share);
        const ext = share.mime.includes("png") ? ".png" : ".jpg";
        const sourceFile = new File([blob], `${share.code}${ext}`, {
          type: share.mime || "image/jpeg",
        });
        const compressed = await compressImageFile(sourceFile, BULK_UPLOAD_PROFILE);
        uploadRows.push({
          code: share.code,
          mime: compressed.format === "webp" ? "image/webp" : "image/jpeg",
          fileName: compressed.fileName,
          dataBase64: compressed.base64,
        });
        await updateBulkProductBatch(userId, batchId, {
          prepReadyCount: uploadRows.length,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await updateBulkProductBatch(userId, batchId, {
          prepStatus: "failed",
          prepError: `${share.code}: ${msg}`,
          prepReadyCount: uploadRows.length,
        });
        throw e;
      }

      await gcPause(i, total);
    }

    await putBulkProductBatchUploadImages(userId, batchId, uploadRows);
    await updateBulkProductBatch(userId, batchId, {
      prepStatus: "ready",
      prepReadyCount: uploadRows.length,
      prepError: undefined,
    });

    opts?.onProgress?.({
      current: total,
      total,
      percent: 100,
      label: "Ready to upload",
    });
  })();

  inflight.set(key, job);
  try {
    await job;
  } finally {
    inflight.delete(key);
  }
}

export function isBulkBatchPrepInflight(userId: string, batchId: string): boolean {
  return inflight.has(`${userId}:${batchId}`);
}
