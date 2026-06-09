import {
  BULK_UPLOAD_PROFILE,
  compressImageFile,
  recompressBase64Image,
} from "./product-image-compress";
import { storedImageToBlob } from "./bulk-product-batch-images";
import type { StoredBulkBatchImage } from "./bulk-product-batch-images";
import type { BulkProductBatchLine, BulkProductBatchRecord } from "./bulk-product-batch-storage";
import { updateBulkProductBatch } from "./bulk-product-batch-storage";
import { uploadProductReliable } from "./velo-products-api";
import { invalidateProductsListCache, normalizeIsDraft } from "./velo-products-cache";

export type BulkBatchUploadProgress = {
  current: number;
  total: number;
  percent: number;
  label: string;
};

function resolveLines(
  batch: BulkProductBatchRecord,
  images: StoredBulkBatchImage[]
): BulkProductBatchLine[] {
  if (batch.lines?.length) return batch.lines;
  const prefix = batch.form.namePrefix.trim();
  return images.map((im, i) => ({
    code: im.code,
    qty: 1,
    productName: `${prefix} ${i + 1}`.trim(),
  }));
}

/**
 * WebP-optimize stamped images, then upload one product per request (reliable upsert).
 */
export async function uploadBulkProductBatchToWebsite(
  userId: string,
  batch: BulkProductBatchRecord,
  images: StoredBulkBatchImage[],
  opts?: {
    onProgress?: (p: BulkBatchUploadProgress) => void;
  }
): Promise<{ uploadedCount: number; websiteCodes: string[]; failures: string[] }> {
  const form = batch.form;
  const lines = resolveLines(batch, images);

  await updateBulkProductBatch(userId, batch.id, {
    uploadStatus: "uploading",
    uploadError: undefined,
  });

  const failures: string[] = [];
  const updatedLines = lines.map((l) => ({ ...l }));
  const pendingIndices = updatedLines
    .map((line, index) => (!line.websiteCode && index < images.length ? index : -1))
    .filter((index) => index >= 0);

  if (pendingIndices.length === 0) {
    const websiteCodes = updatedLines
      .map((l) => l.websiteCode)
      .filter((c): c is string => Boolean(c));
    await updateBulkProductBatch(userId, batch.id, {
      uploadStatus: "done",
      uploadedCount: websiteCodes.length,
      websiteCodes,
      lines: updatedLines,
    });
    invalidateProductsListCache(userId);
    return { uploadedCount: websiteCodes.length, websiteCodes, failures };
  }

  let step = 0;

  for (const i of pendingIndices) {
    const line = updatedLines[i]!;
    const image = images[i]!;
    step += 1;

    opts?.onProgress?.({
      current: step,
      total: pendingIndices.length,
      percent: Math.round(5 + ((step - 0.5) / pendingIndices.length) * 90),
      label: `Optimizing & uploading ${step}/${pendingIndices.length}`,
    });

    try {
      const blob = storedImageToBlob(image);
      const ext = image.mime.includes("png") ? ".png" : ".jpg";
      const sourceFile = new File([blob], `${line.code}${ext}`, {
        type: image.mime || "image/jpeg",
      });

      opts?.onProgress?.({
        current: step,
        total: pendingIndices.length,
        percent: Math.round(5 + ((step - 0.65) / pendingIndices.length) * 90),
        label: `Converting to WebP ${step}/${pendingIndices.length}`,
      });

      const compressed = await compressImageFile(sourceFile, BULK_UPLOAD_PROFILE);

      opts?.onProgress?.({
        current: step,
        total: pendingIndices.length,
        percent: Math.round(5 + ((step - 0.15) / pendingIndices.length) * 90),
        label: `Uploading ${step}/${pendingIndices.length}`,
      });

      const res = await uploadProductReliable(
        userId,
        {
          name: line.productName,
          description: form.description,
          collectionId: form.collectionId,
          tags: form.tags,
          badge: form.badge,
          rating: form.rating,
          price: form.price,
          stock: form.stock,
          isDraft: normalizeIsDraft(form.isDraft),
          sizeConfig: form.sizeConfig,
          imageBase64: compressed.base64,
          imageFileName: compressed.fileName,
        },
        {
          deferCacheInvalidation: true,
          recompressImage: async (base64, fileName) => {
            const smaller = await recompressBase64Image(base64, fileName);
            return { base64: smaller.base64, fileName: smaller.fileName };
          },
        }
      );

      const shopCode = res.product?.productCode;
      if (shopCode) {
        line.websiteCode = shopCode;
      }
    } catch (e) {
      failures.push(`${line.productName}: ${(e as Error).message}`);
    }
  }

  const websiteCodes = updatedLines
    .map((l) => l.websiteCode)
    .filter((c): c is string => Boolean(c));
  const uploadedCount = websiteCodes.length;
  const allDone = updatedLines.every((l) => Boolean(l.websiteCode));
  const uploadStatus =
    uploadedCount === 0 && failures.length > 0
      ? "failed"
      : !allDone && failures.length > 0
        ? "partial"
        : allDone
          ? "done"
          : "partial";

  await updateBulkProductBatch(userId, batch.id, {
    uploadStatus,
    uploadedCount,
    websiteCodes,
    lines: updatedLines,
    uploadError: failures.length > 0 ? failures.slice(0, 3).join(" ") : undefined,
  });

  invalidateProductsListCache(userId);

  const newlyUploaded = pendingIndices.some((i) => updatedLines[i]?.websiteCode);
  if (!newlyUploaded && failures.length > 0) {
    throw new Error(failures[0] ?? "Upload failed.");
  }

  return { uploadedCount, websiteCodes, failures };
}

export function buildBulkBatchShareText(batch: BulkProductBatchRecord): string {
  const form = batch.form;
  const prefix = form.namePrefix.trim();
  const parts: string[] = [];

  if (prefix) parts.push(prefix);
  if (form.description.trim()) parts.push(form.description.trim());

  if (batch.count > 1) {
    parts.push(`${batch.firstCode} → ${batch.lastCode} (${batch.count} items)`);
  } else {
    parts.push(batch.firstCode);
  }

  if (form.price.trim()) {
    parts.push(`Price: ₹${form.price.trim()}`);
  }

  return parts.join("\n\n");
}
