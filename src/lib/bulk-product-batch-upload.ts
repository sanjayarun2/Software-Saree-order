import { recompressBase64Image } from "./product-image-compress";
import {
  getBulkProductBatchImages,
  getBulkProductBatchUploadImages,
  storedImageToBlob,
} from "./bulk-product-batch-images";
import type { StoredBulkBatchImage } from "./bulk-product-batch-images";
import type { BulkProductBatchLine, BulkProductBatchRecord } from "./bulk-product-batch-storage";
import { updateBulkProductBatch } from "./bulk-product-batch-storage";
import { buildBulkProductName } from "./bulk-product-naming";
import { uploadProductReliable } from "./velo-products-api";
import { invalidateProductsListCache, normalizeIsDraft, peekCollectionsCache } from "./velo-products-cache";
import { saveProductShopMeta, slugifyProductName } from "./product-shop-meta-storage";
import { compressImageFile, BULK_UPLOAD_PROFILE } from "./product-image-compress";

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
  return images.map((im) => ({
    code: im.code,
    qty: 1,
    productName: buildBulkProductName(prefix, im.code),
  }));
}

async function resolveUploadPayloadFromShare(
  code: string,
  shareImage: StoredBulkBatchImage
): Promise<{ base64: string; fileName: string }> {
  const blob = storedImageToBlob(shareImage);
  const ext = shareImage.mime.includes("png") ? ".png" : ".jpg";
  const sourceFile = new File([blob], `${code}${ext}`, {
    type: shareImage.mime || "image/jpeg",
  });
  const compressed = await compressImageFile(sourceFile, BULK_UPLOAD_PROFILE);
  return { base64: compressed.base64, fileName: compressed.fileName };
}

/**
 * Upload using pre-built WebP payloads when available; falls back to on-the-fly compress.
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
  const collections = peekCollectionsCache(userId) ?? [];
  const collectionSlug =
    collections.find((c) => c.id === form.collectionId)?.slug ?? null;

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
  const prebuiltRows = await getBulkProductBatchUploadImages(userId, batch.id);
  const prebuiltByCode = new Map(prebuiltRows.map((row) => [row.code, row]));

  for (const i of pendingIndices) {
    const line = updatedLines[i]!;
    const image = images[i]!;
    step += 1;

    opts?.onProgress?.({
      current: step,
      total: pendingIndices.length,
      percent: Math.round(5 + ((step - 0.5) / pendingIndices.length) * 90),
      label: `Uploading ${step}/${pendingIndices.length}`,
    });

    try {
      const prebuilt = prebuiltByCode.get(line.code);
      let payload: { base64: string; fileName: string };
      if (prebuilt?.dataBase64) {
        payload = {
          base64: prebuilt.dataBase64,
          fileName: prebuilt.fileName || `${line.code}.webp`,
        };
      } else {
        payload = await resolveUploadPayloadFromShare(line.code, image);
      }

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
          imageBase64: payload.base64,
          imageFileName: payload.fileName,
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
      const productId = res.product?.productId;
      const apiSlug = (res.product as { slug?: string } | undefined)?.slug;
      if (shopCode) line.websiteCode = shopCode;
      if (productId) {
        line.websiteProductId = productId;
        const slug = apiSlug || slugifyProductName(line.productName);
        await saveProductShopMeta(userId, {
          productId,
          slug,
          collectionId: form.collectionId,
          collectionSlug,
          updatedAt: new Date().toISOString(),
        });
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

  const newlyUploaded = pendingIndices.some((idx) => updatedLines[idx]?.websiteCode);
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
