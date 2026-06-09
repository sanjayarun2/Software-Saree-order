import { Capacitor } from "@capacitor/core";

export type ShareCodedImagesOptions = {
  title?: string;
  /** Caption / message body (e.g. product description + code range). */
  text?: string;
};

/**
 * Opens the system share sheet with all batch images so the user can pick WhatsApp
 * (and attachments appear as selected files where the OS supports it).
 */
export async function shareProductCodeImagesAsFiles(
  items: { blob: Blob; filename: string }[],
  options?: ShareCodedImagesOptions
): Promise<void> {
  if (typeof window === "undefined" || items.length === 0) return;

  const files = items.map(
    ({ blob, filename }) => new File([blob], filename, { type: blob.type || "image/jpeg" })
  );

  const title = options?.title ?? "Product codes";
  const text =
    options?.text?.trim() ||
    `${files.length} coded photo${files.length === 1 ? "" : "s"}`;

  try {
    if (navigator.share && navigator.canShare?.({ files, text })) {
      await navigator.share({ files, title, text });
      return;
    }
    if (navigator.share && navigator.canShare?.({ files })) {
      await navigator.share({ files, title, text });
      return;
    }
  } catch (e) {
    if ((e as Error).name === "AbortError") return;
    console.warn("[product-code-share] navigator.share failed:", e);
  }

  if (Capacitor.isNativePlatform()) {
    try {
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      const { Share } = await import("@capacitor/share");
      const written: string[] = [];
      const toB64 = (buf: ArrayBuffer): string => {
        const bytes = new Uint8Array(buf);
        let binary = "";
        const chunk = 0x8000;
        for (let j = 0; j < bytes.length; j += chunk) {
          binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(j, j + chunk)) as unknown as number[]);
        }
        return btoa(binary);
      };

      for (let i = 0; i < items.length; i++) {
        const { blob, filename } = items[i]!;
        const buf = await blob.arrayBuffer();
        const path = `product-codes-share/${Date.now()}-${i}-${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const res = await Filesystem.writeFile({
          path,
          data: toB64(buf),
          directory: Directory.Cache,
        });
        if (res.uri) written.push(res.uri);
      }
      if (written.length === 1) {
        const can = await Share.canShare();
        if (can.value) {
          await Share.share({
            title,
            text,
            url: written[0],
            dialogTitle: "Share via WhatsApp or other app",
          });
          return;
        }
      }
    } catch (e) {
      console.warn("[product-code-share] native share failed:", e);
    }
  }

  const fallback = `${text}\n\n(${items.length} photo${items.length === 1 ? "" : "s"} — attach from your downloads or gallery.)`;
  window.open(
    `https://wa.me/?text=${encodeURIComponent(fallback)}`,
    "_blank",
    "noopener,noreferrer"
  );
}
