/**
 * Resize/compress with browser-image-compression (Web Worker), then stamp code on canvas.
 */

export async function compressImageFile(file: File): Promise<Blob> {
  const imageCompression = (await import("browser-image-compression")).default;
  const isPng = file.type === "image/png";
  const blob = await imageCompression(file, {
    maxSizeMB: 3.5,
    maxWidthOrHeight: 2560,
    useWebWorker: true,
    initialQuality: 0.88,
    fileType: isPng ? "image/png" : "image/jpeg",
  });
  return blob as Blob;
}

export async function stampProductCodeOnBlob(imageBlob: Blob, code: string): Promise<Blob> {
  const bmp = await createImageBitmap(imageBlob);
  try {
    const w = bmp.width;
    const h = bmp.height;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");

    ctx.drawImage(bmp, 0, 0);
    const fontSize = Math.round(Math.max(16, Math.min(56, w * 0.042)));
    ctx.font = `bold ${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    const pad = Math.round(fontSize * 0.55);
    const x = w - pad;
    const y = pad;
    const lineWidth = Math.max(2.5, fontSize / 9);
    ctx.strokeStyle = "rgba(0,0,0,0.92)";
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = "round";
    ctx.fillStyle = "#dc2626";
    ctx.strokeText(code, x, y);
    ctx.fillText(code, x, y);

    const mime = imageBlob.type.includes("png") ? "image/png" : "image/jpeg";
    const quality = mime === "image/jpeg" ? 0.9 : undefined;

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (b) resolve(b);
          else reject(new Error("Export failed"));
        },
        mime,
        quality
      );
    });
  } finally {
    bmp.close();
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function extensionForBlob(originalFile: File, outBlob: Blob): string {
  if (outBlob.type.includes("png") || originalFile.type === "image/png") return "png";
  return "jpg";
}

export function safeFilename(code: string, ext: string): string {
  const base = code.replace(/[^A-Za-z0-9]/g, "") || "product";
  return `${base}.${ext}`;
}
