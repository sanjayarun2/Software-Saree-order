const MAX_EDGE = 2400;
const TARGET_BYTES = 2 * 1024 * 1024;
const QUALITY_STEPS = [0.9, 0.86, 0.82, 0.78, 0.74] as const;

export type CompressedImage = {
  base64: string;
  fileName: string;
  width: number;
  height: number;
  bytes: number;
};

function replaceExt(name: string, ext: string) {
  return name.replace(/\.[^/.]+$/, "") + ext;
}

export async function compressImageFile(file: File): Promise<CompressedImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error(`${file.name}: only image files are allowed.`);
  }
  if (file.type === "image/gif") {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    if (bytes.length > TARGET_BYTES) {
      throw new Error(`${file.name}: GIF is too large. Use a smaller image.`);
    }
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    const base64 = btoa(binary);
    return {
      base64,
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
    if (!ow || !oh) throw new Error(`${file.name}: invalid image dimensions.`);

    const scale = Math.min(1, MAX_EDGE / Math.max(ow, oh));
    const tw = Math.max(1, Math.round(ow * scale));
    const th = Math.max(1, Math.round(oh * scale));

    const canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error(`${file.name}: could not process image.`);
    ctx.drawImage(image, 0, 0, tw, th);

    let blob: Blob | null = null;
    for (const q of QUALITY_STEPS) {
      blob = await new Promise<Blob | null>((res) =>
        canvas.toBlob((b) => res(b), "image/jpeg", q)
      );
      if (blob && blob.size <= TARGET_BYTES) break;
    }
    if (!blob) throw new Error(`${file.name}: could not compress image.`);

    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    const base64 = btoa(binary);

    return {
      base64,
      fileName: replaceExt(file.name, ".jpg"),
      width: tw,
      height: th,
      bytes: bytes.length,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
