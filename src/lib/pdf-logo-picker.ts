/**
 * Cross-platform logo image picker for PDF settings.
 * - Native (Android/iOS): Uses system Photo Picker (Android 11+) or ACTION_OPEN_DOCUMENT fallback,
 *   no broad storage permissions. Returns image as Blob so we persist to Supabase immediately (no temp URI reliance).
 * - Web: Caller uses <input type="file" accept="image/*">; this module is not used.
 */

import { Capacitor } from "@capacitor/core";

export const LOGO_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
/** Minimum pixels on shorter side for ~300 DPI print over 40×20mm slot. */
export const LOGO_MIN_SIDE_PX = 300;

export interface PickedLogo {
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  const i = dataUrl.indexOf(",");
  if (i === -1) return null;
  const base64 = dataUrl.slice(i + 1);
  const m = dataUrl.slice(0, i).match(/data:([^;]+);/);
  const mime = m ? m[1].trim() : "image/png";
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j);
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}

function getImageDimensionsFromDataUrl(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve({ width: 0, height: 0 });
      return;
    }
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = dataUrl;
  });
}

/**
 * Pick a logo image on native (Android/iOS) using the system photo picker.
 * Returns null if not native, user cancelled, or pick failed.
 * MIME is restricted to image/png, image/jpeg, image/webp.
 */
export async function pickLogoImageNative(): Promise<PickedLogo | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { Camera, CameraSource, CameraResultType } = await import("@capacitor/camera");
    const photo = await Camera.getPhoto({
      source: CameraSource.Photos,
      resultType: CameraResultType.DataUrl,
      quality: 90,
      allowEditing: false,
    });
    const dataUrl = photo.dataUrl;
    if (!dataUrl) return null;

    const blob = dataUrlToBlob(dataUrl);
    if (!blob) return null;

    const mime = photo.format === "png" ? "image/png" : photo.format === "webp" ? "image/webp" : "image/jpeg";
    if (!LOGO_MIME_TYPES.includes(mime as any)) return null;
    if (blob.size > LOGO_MAX_BYTES) return null;

    const { width, height } = await getImageDimensionsFromDataUrl(dataUrl);
    return { blob, mimeType: mime, width, height };
  } catch (e) {
    console.warn("[PDF Logo Picker] native pick failed:", e);
    return null;
  }
}

/**
 * Returns true if the app is running on native (Capacitor) so the UI can use the native picker instead of file input.
 */
export function useNativeLogoPicker(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Check if image dimensions are below recommended for 300 DPI print (40×20mm ≈ 472×236 px).
 * Shows a subtle warning when the shorter side is below LOGO_MIN_SIDE_PX.
 */
export function isLowResolutionForPrint(width: number, height: number): boolean {
  const minSide = Math.min(width, height);
  return minSide > 0 && minSide < LOGO_MIN_SIDE_PX;
}
