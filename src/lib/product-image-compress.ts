export type CompressedImage = {
  base64: string;
  fileName: string;
  width: number;
  height: number;
  bytes: number;
};

export type CompressProfile = {
  maxEdge: number;
  targetBytes: number;
  qualitySteps: readonly number[];
};

/** Single product upload — fits Vercel/edge ~4.5 MB body limit with JSON overhead. */
export const SINGLE_UPLOAD_PROFILE: CompressProfile = {
  maxEdge: 1920,
  targetBytes: 1_100_000,
  qualitySteps: [0.88, 0.84, 0.8, 0.76, 0.72, 0.68],
};

/** Bulk upload — one image per API request. */
export const BULK_UPLOAD_PROFILE: CompressProfile = {
  maxEdge: 1600,
  targetBytes: 750_000,
  qualitySteps: [0.84, 0.8, 0.76, 0.72, 0.68, 0.64],
};

/** Last resort after HTTP 413. */
export const AGGRESSIVE_UPLOAD_PROFILE: CompressProfile = {
  maxEdge: 1280,
  targetBytes: 450_000,
  qualitySteps: [0.72, 0.68, 0.64, 0.6],
};

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

async function canvasToJpegBlob(canvas: HTMLCanvasElement, profile: CompressProfile) {
  for (const q of profile.qualitySteps) {
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob((b) => res(b), "image/jpeg", q)
    );
    if (blob && blob.size <= profile.targetBytes) return blob;
  }
  return null;
}

async function rasterizeToCanvas(
  source: CanvasImageSource,
  width: number,
  height: number,
  maxEdge: number
) {
  const ow = width;
  const oh = height;
  if (!ow || !oh) throw new Error("Invalid image dimensions.");

  const scale = Math.min(1, maxEdge / Math.max(ow, oh));
  const tw = Math.max(1, Math.round(ow * scale));
  const th = Math.max(1, Math.round(oh * scale));

  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process image.");
  ctx.drawImage(source, 0, 0, tw, th);
  return { canvas, tw, th };
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
      throw new Error(`${file.name}: GIF is too large. Use a smaller image.`);
    }
    return {
      base64: bytesToBase64(bytes),
      fileName: file.name,
      width: 0,
      height: 0,
      bytes: bytes.length,
    };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`${file.name}: unsupported image format.`));
      img.src = objectUrl;
    });

    const ow = image.naturalWidth || image.width;
    const oh = image.naturalHeight || image.height;
    const { canvas, tw, th } = await rasterizeToCanvas(image, ow, oh, profile.maxEdge);
    const blob = await canvasToJpegBlob(canvas, profile);
    if (!blob) {
      throw new Error(`${file.name}: could not compress image small enough. Try a smaller photo.`);
    }

    const bytes = new Uint8Array(await blob.arrayBuffer());
    return {
      base64: bytesToBase64(bytes),
      fileName: replaceExt(file.name, ".jpg"),
      width: tw,
      height: th,
      bytes: bytes.length,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function recompressBase64Image(
  base64: string,
  fileName: string,
  profile: CompressProfile = AGGRESSIVE_UPLOAD_PROFILE
): Promise<CompressedImage> {
  const raw = base64.includes(",") ? base64.split(",").pop()! : base64;
  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const blob = new Blob([bytes], { type: "image/jpeg" });
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`${fileName}: could not recompress image.`));
      img.src = objectUrl;
    });
    const ow = image.naturalWidth || image.width;
    const oh = image.naturalHeight || image.height;
    const { canvas, tw, th } = await rasterizeToCanvas(image, ow, oh, profile.maxEdge);
    const out = await canvasToJpegBlob(canvas, profile);
    if (!out) throw new Error(`${fileName}: image still too large after compression.`);

    const outBytes = new Uint8Array(await out.arrayBuffer());
    return {
      base64: bytesToBase64(outBytes),
      fileName: replaceExt(fileName, ".jpg"),
      width: tw,
      height: th,
      bytes: outBytes.length,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
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
