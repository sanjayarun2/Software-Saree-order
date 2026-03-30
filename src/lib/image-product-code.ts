/**
 * Stamp product-code text on images using WASM-based decode/encode.
 *
 * Decode: @jsquash/jpeg or @jsquash/png (MozJPEG / OxiPNG via WebAssembly)
 * Overlay: OffscreenCanvas (if available) or regular canvas for text drawing
 * Encode: @jsquash/jpeg or @jsquash/png back to binary
 *
 * This avoids createImageBitmap entirely — the known cause of
 * "could not decode image" on mobile browsers during batch processing.
 * WASM decoders are deterministic, don't leak memory, and don't
 * compete with browser background decode threads.
 */

import jpegDecode from "@jsquash/jpeg/decode";
import jpegEncode from "@jsquash/jpeg/encode";
import pngDecode from "@jsquash/png/decode";
import pngEncode from "@jsquash/png/encode";

// ─── Detect format ──────────────────────────────────────────────

function isPng(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 8) return false;
  const sig = new Uint8Array(buf, 0, 8);
  return sig[0] === 0x89 && sig[1] === 0x50 && sig[2] === 0x4e && sig[3] === 0x47;
}

// ─── Text overlay via canvas ────────────────────────────────────

function drawTextOverlay(imageData: ImageData, code: string): ImageData {
  const { width: w, height: h } = imageData;

  const useOffscreen = typeof OffscreenCanvas !== "undefined";
  let canvas: HTMLCanvasElement | OffscreenCanvas;
  let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;

  if (useOffscreen) {
    canvas = new OffscreenCanvas(w, h);
    ctx = canvas.getContext("2d");
  } else {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    canvas = c;
    ctx = c.getContext("2d");
  }

  if (!ctx) throw new Error("Canvas 2D context unavailable");

  ctx.putImageData(imageData, 0, 0);

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

  const result = ctx.getImageData(0, 0, w, h);

  canvas.width = 0;
  canvas.height = 0;

  return result;
}

// ─── Core stamp function ────────────────────────────────────────

async function stampSingle(fileBuffer: ArrayBuffer, code: string, asPng: boolean): Promise<ArrayBuffer> {
  const decoded = asPng
    ? await pngDecode(fileBuffer)
    : await jpegDecode(fileBuffer);

  const stamped = drawTextOverlay(decoded, code);

  const encoded: ArrayBuffer = asPng
    ? await pngEncode(stamped)
    : await jpegEncode(stamped, { quality: 92 });

  return encoded;
}

// ─── Public API ─────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MAX_ATTEMPTS = 4;

export async function stampProductCodeOnFile(file: File, code: string): Promise<Blob> {
  const buffer = await file.arrayBuffer();
  const asPng = isPng(buffer);
  const mime = asPng ? "image/png" : "image/jpeg";

  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const result = await stampSingle(buffer, code, asPng);
      const blob = new Blob([result], { type: mime });
      if (blob.size < 1) throw new Error("Stamped image was empty");
      return blob;
    } catch (err) {
      lastErr = err;
      await delay(150 * (attempt + 1));
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error("Could not process image");
}

/**
 * Pause between images to let GC reclaim memory.
 * Longer pause every N images to keep heap stable on large batches.
 */
export async function gcPause(index: number, total: number): Promise<void> {
  if (total <= 5) {
    await delay(50);
  } else if ((index + 1) % 4 === 0) {
    await delay(300);
  } else {
    await delay(80);
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
