/**
 * Web Worker: stamps product-code text onto an image blob using OffscreenCanvas.
 * Runs entirely off the main thread — no DOM, no HTMLImageElement, no memory spikes on UI thread.
 *
 * Message protocol:
 *   IN:  { id, blob: Blob, code: string }
 *   OUT: { id, blob: Blob } | { id, error: string }
 */

self.onmessage = async function (e) {
  const { id, blob, code } = e.data;
  try {
    const result = await stampImage(blob, code);
    self.postMessage({ id, blob: result }, [await result.arrayBuffer()]);
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};

async function stampImage(blob, code) {
  const bmp = await createImageBitmap(blob);
  const w = bmp.width;
  const h = bmp.height;

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bmp.close();
    throw new Error("Canvas 2D context not available in worker");
  }

  ctx.drawImage(bmp, 0, 0);
  bmp.close();

  const fontSize = Math.round(Math.max(20, Math.min(72, w * 0.056)));
  ctx.font =
    "700 " +
    fontSize +
    'px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif';
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

  const mime = blob.type.includes("png") ? "image/png" : "image/jpeg";
  const quality = mime === "image/jpeg" ? 0.92 : undefined;
  const result = await canvas.convertToBlob({ type: mime, quality });

  canvas.width = 0;
  canvas.height = 0;

  return result;
}
