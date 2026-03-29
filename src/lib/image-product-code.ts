/**
 * Resize/compress with browser-image-compression, then stamp code on canvas.
 * Falls back without Web Worker / createImageBitmap for older WebViews (e.g. Capacitor).
 */

function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = url;
  });
}

function stampOnCanvas(
  source: CanvasImageSource,
  w: number,
  h: number,
  code: string,
  mime: string,
  quality?: number
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  ctx.drawImage(source, 0, 0);
  const fontSize = Math.round(Math.max(20, Math.min(72, w * 0.056)));
  ctx.font = `700 ${fontSize}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif`;
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

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error("Export failed"));
      },
      mime,
      quality
    );
  });
}

export async function compressImageFile(file: File): Promise<Blob> {
  const imageCompression = (await import("browser-image-compression")).default;
  const isPng = file.type === "image/png";
  const baseOpts = {
    maxSizeMB: 3.5,
    maxWidthOrHeight: 2560,
    initialQuality: 0.88,
    fileType: isPng ? ("image/png" as const) : ("image/jpeg" as const),
  };
  try {
    return (await imageCompression(file, { ...baseOpts, useWebWorker: false })) as Blob;
  } catch {
    try {
      return (await imageCompression(file, { ...baseOpts, useWebWorker: true })) as Blob;
    } catch {
      return file;
    }
  }
}

export async function stampProductCodeOnBlob(imageBlob: Blob, code: string): Promise<Blob> {
  const mime = imageBlob.type.includes("png") ? "image/png" : "image/jpeg";
  const quality = mime === "image/jpeg" ? 0.9 : undefined;

  try {
    const bmp = await createImageBitmap(imageBlob);
    try {
      return await stampOnCanvas(bmp, bmp.width, bmp.height, code, mime, quality);
    } finally {
      bmp.close();
    }
  } catch {
    const url = URL.createObjectURL(imageBlob);
    try {
      const img = await loadImageFromUrl(url);
      return await stampOnCanvas(img, img.naturalWidth, img.naturalHeight, code, mime, quality);
    } finally {
      URL.revokeObjectURL(url);
    }
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
