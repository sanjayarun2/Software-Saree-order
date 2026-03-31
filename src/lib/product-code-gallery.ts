import { Capacitor } from "@capacitor/core";
import { downloadBlob } from "./image-product-code";

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let j = 0; j < bytes.length; j += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(j, j + chunk)) as unknown as number[]);
  }
  return btoa(binary);
}

const DOWNLOADED_KEY = "product_code_downloaded_batches";

export function isBatchDownloaded(batchId: string): boolean {
  try {
    const raw = localStorage.getItem(DOWNLOADED_KEY);
    if (!raw) return false;
    const set: string[] = JSON.parse(raw);
    return set.includes(batchId);
  } catch {
    return false;
  }
}

export function markBatchDownloaded(batchId: string): void {
  try {
    const raw = localStorage.getItem(DOWNLOADED_KEY);
    const set: string[] = raw ? JSON.parse(raw) : [];
    if (!set.includes(batchId)) {
      set.push(batchId);
      if (set.length > 200) set.splice(0, set.length - 200);
      localStorage.setItem(DOWNLOADED_KEY, JSON.stringify(set));
    }
  } catch {
    // ignore
  }
}

export function unmarkBatchDownloaded(batchId: string): void {
  try {
    const raw = localStorage.getItem(DOWNLOADED_KEY);
    if (!raw) return;
    const set: string[] = JSON.parse(raw);
    const filtered = set.filter((id) => id !== batchId);
    localStorage.setItem(DOWNLOADED_KEY, JSON.stringify(filtered));
  } catch {
    // ignore
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Save batch images to device: Capacitor native -> app Documents/VeloProductCodes; web -> download each file.
 * Uses longer delays between web downloads to prevent browser throttling for large batches.
 */
export async function saveProductCodeImagesToGalleryOrDownloads(
  items: { blob: Blob; filename: string }[]
): Promise<boolean> {
  if (typeof window === "undefined" || items.length === 0) return false;

  if (Capacitor.isNativePlatform()) {
    try {
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      const day = new Date().toISOString().slice(0, 10);
      for (let i = 0; i < items.length; i++) {
        const { blob, filename } = items[i]!;
        const buf = await blob.arrayBuffer();
        const path = `VeloProductCodes/${day}/${filename.replace(/[/\\]/g, "_")}`;
        await Filesystem.writeFile({
          path,
          data: arrayBufferToBase64(buf),
          directory: Directory.Documents,
          recursive: true,
        });
      }
      return true;
    } catch (e) {
      console.warn("[product-code-gallery] Filesystem save failed, falling back to downloads:", e);
    }
  }

  const batchSize = 5;
  for (let i = 0; i < items.length; i++) {
    downloadBlob(items[i]!.blob, items[i]!.filename);

    if ((i + 1) % batchSize === 0 && i + 1 < items.length) {
      await delay(1500);
    } else if (i + 1 < items.length) {
      await delay(400);
    }
  }
  return false;
}
