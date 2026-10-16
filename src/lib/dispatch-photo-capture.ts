/**
 * Capture one optional dispatch proof photo.
 * Native: Capacitor Camera (already in the app). Web: file input with capture.
 * Does not open or change the barcode scanner.
 */

import { Capacitor } from "@capacitor/core";
import {
  compressImageFile,
  type CompressedImage,
  type CompressProfile,
} from "./product-image-compress";

/** Small proof shot — keep IDB light. */
export const DISPATCH_PHOTO_PROFILE: CompressProfile = {
  maxEdge: 1280,
  targetBytes: 280_000,
  qualitySteps: [0.72, 0.68, 0.64, 0.6, 0.56],
};

export type CapturedDispatchPhoto = {
  base64: string;
  mime: string;
  previewUrl: string;
};

function dataUrlToFile(dataUrl: string, fileName: string): File | null {
  const i = dataUrl.indexOf(",");
  if (i === -1) return null;
  const meta = dataUrl.slice(0, i);
  const base64 = dataUrl.slice(i + 1);
  const m = meta.match(/data:([^;]+);/);
  const mime = m?.[1]?.trim() || "image/jpeg";
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j);
    return new File([bytes], fileName, { type: mime });
  } catch {
    return null;
  }
}

async function compressToDispatchPhoto(file: File): Promise<CapturedDispatchPhoto> {
  const compressed: CompressedImage = await compressImageFile(file, DISPATCH_PHOTO_PROFILE);
  const mime =
    compressed.format === "png"
      ? "image/png"
      : compressed.format === "webp"
        ? "image/webp"
        : "image/jpeg";
  return {
    base64: compressed.base64,
    mime,
    previewUrl: `data:${mime};base64,${compressed.base64}`,
  };
}

/** Native camera capture. Returns null if cancelled / not native. */
export async function captureDispatchPhotoNative(): Promise<CapturedDispatchPhoto | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { Camera, CameraSource, CameraResultType } = await import("@capacitor/camera");
    const photo = await Camera.getPhoto({
      source: CameraSource.Camera,
      resultType: CameraResultType.DataUrl,
      quality: 80,
      allowEditing: false,
      correctOrientation: true,
    });
    if (!photo.dataUrl) return null;
    const file = dataUrlToFile(photo.dataUrl, `dispatch-${Date.now()}.jpg`);
    if (!file) return null;
    return compressToDispatchPhoto(file);
  } catch {
    return null;
  }
}

/** Compress a file chosen via input[type=file] accept=image/* capture. */
export async function captureDispatchPhotoFromFile(
  file: File
): Promise<CapturedDispatchPhoto> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose a photo.");
  }
  return compressToDispatchPhoto(file);
}

export function isNativeDispatchPhotoCapture(): boolean {
  return Capacitor.isNativePlatform();
}
