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

/**
 * Save batch images to device: Capacitor → app Documents/VeloProductCodes; web → download each file.
 * @returns true if files were written via native Filesystem (open Files app / same app storage).
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

  for (const { blob, filename } of items) {
    downloadBlob(blob, filename);
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}
