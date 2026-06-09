export type ImageOutputFormat = "webp" | "jpeg" | "gif";

export type CompressedImage = {
  base64: string;
  fileName: string;
  width: number;
  height: number;
  bytes: number;
  format: ImageOutputFormat;
};

export type CompressProfile = {
  maxEdge: number;
  targetBytes: number;
  /** WebP quality steps (primary). JPEG fallback uses same steps. */
  qualitySteps: readonly number[];
};

/** E-commerce single product — WebP ~800 KB, long edge 1920px. */
export const SINGLE_UPLOAD_PROFILE: CompressProfile = {
  maxEdge: 1920,
  targetBytes: 850_000,
  qualitySteps: [0.84, 0.8, 0.76, 0.72, 0.68, 0.64],
};

/** Bulk upload — one image per API request, smaller payload. */
export const BULK_UPLOAD_PROFILE: CompressProfile = {
  maxEdge: 1600,
  targetBytes: 520_000,
  qualitySteps: [0.82, 0.78, 0.74, 0.7, 0.66, 0.62],
};

/** Last resort after HTTP 413. */
export const AGGRESSIVE_UPLOAD_PROFILE: CompressProfile = {
  maxEdge: 1280,
  targetBytes: 320_000,
  qualitySteps: [0.72, 0.68, 0.64, 0.6, 0.56],
};

let webpEncodeSupported: boolean | null = null;

function replaceExt(name: string, ext: string) {
  return name.replace(/\.[^/.]+$/, "") + ext;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function detectWebpEncodeSupport() {
  if (webpEncodeSupported !== null) return webpEncodeSupported;
  if (typeof document === "undefined") {
    webpEncodeSupported = false;
    return false;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 2;
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/webp", 0.8)
  );
  webpEncodeSupported = Boolean(blob && blob.type === "image/webp");
  return webpEncodeSupported;
}

type DecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
};

async function decodeImageFile(file: File, label: string): Promise<DecodedImage> {
  if (typeof createImageBitmap !== "undefined") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
      };
    } catch {
      /* fall through to Image() */
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`${label}: unsupported image format.`));
      img.src = objectUrl;
    });
    return {
      source: image,
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
      cleanup: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (e) {
    URL.revokeObjectURL(objectUrl);
    throw e;
  }
}

async function decodeBase64Image(
  base64: string,
  fileName: string,
  mimeHint: string
): Promise<DecodedImage> {
  const raw = base64.includes(",") ? base64.split(",").pop()! : base64;
  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const blob = new Blob([bytes], {
    type: mimeHint || "application/octet-stream",
  });

  if (typeof createImageBitmap !== "undefined") {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
      };
    } catch {
      /* fall through */
    }
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`${fileName}: could not decode image.`));
      img.src = objectUrl;
    });
    return {
      source: image,
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
      cleanup: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (e) {
    URL.revokeObjectURL(objectUrl);
    throw e;
  }
}

function mimeHintFromFileName(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

async function rasterizeToCanvas(source: CanvasImageSource, width: number, height: number, maxEdge: number) {
  if (!width || !height) throw new Error("Invalid image dimensions.");

  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const tw = Math.max(1, Math.round(width * scale));
  const th = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process image.");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, tw, th);

  return { canvas, tw, th };
}

async function canvasToOptimizedBlob(
  canvas: HTMLCanvasElement,
  profile: CompressProfile
): Promise<{ blob: Blob; format: Exclude<ImageOutputFormat, "gif"> } | null> {
  const useWebp = await detectWebpEncodeSupport();
  const codecs: { mime: string; format: "webp" | "jpeg" }[] = useWebp
    ? [
        { mime: "image/webp", format: "webp" },
        { mime: "image/jpeg", format: "jpeg" },
      ]
    : [{ mime: "image/jpeg", format: "jpeg" }];

  let smallest: { blob: Blob; format: "webp" | "jpeg" } | null = null;

  for (const codec of codecs) {
    for (const q of profile.qualitySteps) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), codec.mime, q)
      );
      if (!blob) continue;
      if (blob.size <= profile.targetBytes) {
        return { blob, format: codec.format };
      }
      if (!smallest || blob.size < smallest.blob.size) {
        smallest = { blob, format: codec.format };
      }
    }
  }

  if (smallest && smallest.blob.size <= profile.targetBytes * 1.05) {
    return smallest;
  }

  return null;
}

async function encodeCanvas(
  canvas: HTMLCanvasElement,
  tw: number,
  th: number,
  originalName: string,
  profile: CompressProfile
): Promise<CompressedImage> {
  const encoded = await canvasToOptimizedBlob(canvas, profile);
  if (!encoded) {
    throw new Error(`${originalName}: could not compress image small enough. Try a smaller photo.`);
  }

  const bytes = new Uint8Array(await encoded.blob.arrayBuffer());
  const ext = encoded.format === "webp" ? ".webp" : ".jpg";

  return {
    base64: bytesToBase64(bytes),
    fileName: replaceExt(originalName, ext),
    width: tw,
    height: th,
    bytes: bytes.length,
    format: encoded.format,
  };
}

export async function compressImageFile(
  file: File,
  profile: CompressProfile = SINGLE_UPLOAD_PROFILE
): Promise<CompressedImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error(`${file.name}: only image files are allowed.`);
  }

  if (file.type === "image/gif") {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    if (bytes.length > profile.targetBytes) {
      throw new Error(`${file.name}: GIF is too large. Use a smaller image or a still photo.`);
    }
    return {
      base64: bytesToBase64(bytes),
      fileName: file.name,
      width: 0,
      height: 0,
      bytes: bytes.length,
      format: "gif",
    };
  }

  const decoded = await decodeImageFile(file, file.name);
  try {
    const { canvas, tw, th } = await rasterizeToCanvas(
      decoded.source,
      decoded.width,
      decoded.height,
      profile.maxEdge
    );
    return encodeCanvas(canvas, tw, th, file.name, profile);
  } finally {
    decoded.cleanup();
  }
}

export async function recompressBase64Image(
  base64: string,
  fileName: string,
  profile: CompressProfile = AGGRESSIVE_UPLOAD_PROFILE
): Promise<CompressedImage> {
  const decoded = await decodeBase64Image(base64, fileName, mimeHintFromFileName(fileName));
  try {
    const { canvas, tw, th } = await rasterizeToCanvas(
      decoded.source,
      decoded.width,
      decoded.height,
      profile.maxEdge
    );
    return encodeCanvas(canvas, tw, th, fileName, profile);
  } finally {
    decoded.cleanup();
  }
}

/** Rough JSON body size for one bulk item (base64 + shared fields). */
export function estimateBulkItemPayloadBytes(base64: string) {
  return base64.length + 2048;
}

export function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
