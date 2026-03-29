/**
 * Stamp product-code text on images.
 *
 * Primary path: OffscreenCanvas inside a Web Worker (off main thread, no UI jank).
 * Fallback:     Main-thread canvas (for browsers without OffscreenCanvas / Worker support).
 *
 * Memory management:
 *  - ImageBitmaps are closed immediately after use.
 *  - Canvas dimensions are zeroed after export to release GPU backing store.
 *  - Each image is processed sequentially with a GC-friendly pause between items.
 */

// ─── Worker pool (single reusable worker) ───────────────────────

let worker: Worker | null = null;
let workerSupported: boolean | null = null;
let msgId = 0;
const pending = new Map<number, { resolve: (b: Blob) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (workerSupported === false) return null;
  if (worker) return worker;
  try {
    const w = new Worker("/stamp-worker.js");
    w.onmessage = (e: MessageEvent) => {
      const { id, blob, error } = e.data;
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      if (error) p.reject(new Error(error));
      else p.resolve(blob);
    };
    w.onerror = () => {
      workerSupported = false;
      for (const [, p] of pending) p.reject(new Error("Worker crashed"));
      pending.clear();
      worker = null;
    };
    workerSupported = true;
    worker = w;
    return w;
  } catch {
    workerSupported = false;
    return null;
  }
}

function stampViaWorker(blob: Blob, code: string): Promise<Blob> {
  const w = getWorker();
  if (!w) return Promise.reject(new Error("Worker unavailable"));
  const id = ++msgId;
  return new Promise<Blob>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, blob, code });
  });
}

// ─── Main-thread fallback ───────────────────────────────────────

function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode image"));
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
        canvas.width = 0;
        canvas.height = 0;
        if (b && b.size > 0) resolve(b);
        else reject(new Error("Canvas export failed"));
      },
      mime,
      quality
    );
  });
}

async function stampMainThread(blob: Blob, code: string): Promise<Blob> {
  const mime = blob.type.includes("png") ? "image/png" : "image/jpeg";
  const quality = mime === "image/jpeg" ? 0.92 : undefined;

  try {
    const bmp = await createImageBitmap(blob);
    try {
      return await stampOnCanvas(bmp, bmp.width, bmp.height, code, mime, quality);
    } finally {
      bmp.close();
    }
  } catch {
    const url = URL.createObjectURL(blob);
    try {
      const img = await loadImageFromUrl(url);
      return await stampOnCanvas(img, img.naturalWidth, img.naturalHeight, code, mime, quality);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

// ─── Public API ─────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MAX_ATTEMPTS = 6;
const BASE_DELAY_MS = 100;

/**
 * Stamp `code` on `file`. Tries worker first, falls back to main thread.
 * Retries with exponential backoff up to MAX_ATTEMPTS.
 */
export async function stampProductCodeOnFile(file: File, code: string): Promise<Blob> {
  let lastErr: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const blob: Blob = attempt < 3 ? await stampViaWorker(file, code) : await stampMainThread(file, code);
      if (blob.size < 1) throw new Error("Stamped image was empty");
      return blob;
    } catch (err) {
      lastErr = err;
      const isWorkerErr = (err instanceof Error) && err.message.includes("Worker");
      if (isWorkerErr && attempt < 3) {
        await delay(BASE_DELAY_MS);
        continue;
      }
      await delay(BASE_DELAY_MS * (attempt + 1));
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error("Could not load image");
}

/**
 * Pause between images to let GC reclaim memory.
 * Longer pause every N images to keep heap stable on large batches.
 */
export async function gcPause(index: number, total: number): Promise<void> {
  if (total <= 5) {
    await delay(30);
  } else if ((index + 1) % 5 === 0) {
    await delay(200);
  } else {
    await delay(50);
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
