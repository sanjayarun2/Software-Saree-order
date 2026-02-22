import { supabase } from "./supabase";

export type PdfContentType = "text" | "logo";
/** Vertical position only; horizontal is always center. */
export type PdfPlacement = "top" | "bottom";

const PDF_LOGOS_BUCKET = "pdf-logos";
const LOGO_FILE_NAME = "logo.png";

/** Section height in mm (one label section on A4). */
export const PDF_SECTION_H_MM = 74.25;

export interface PdfSettingsRow {
  user_id: string;
  content_type: PdfContentType;
  placement: PdfPlacement;
  text_size: number;
  custom_text: string;
  logo_path: string | null;
  logo_zoom: number;
  logo_y_mm: number;
  from_y_mm: number;
  to_y_mm: number;
  updated_at: string;
}

const defaultSettings: Omit<PdfSettingsRow, "user_id" | "updated_at"> = {
  content_type: "logo",
  placement: "bottom",
  text_size: 15,
  custom_text: "",
  logo_path: null,
  logo_zoom: 1.0,
  logo_y_mm: 50,
  from_y_mm: 27,
  to_y_mm: 8,
};

/** Fetch PDF settings for a user from Supabase. Returns null if not found. */
export async function getPdfSettings(userId: string): Promise<PdfSettingsRow | null> {
  const { data, error } = await supabase
    .from("pdf_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.warn("[PDF Settings] getPdfSettings error:", error);
    return null;
  }
  return data as PdfSettingsRow | null;
}

/** Upsert PDF settings for a user. */
export async function upsertPdfSettings(
  userId: string,
  settings: {
    content_type?: PdfContentType;
    placement?: PdfPlacement;
    text_size?: number;
    custom_text?: string;
    logo_path?: string | null;
    logo_zoom?: number;
    logo_y_mm?: number;
    from_y_mm?: number;
    to_y_mm?: number;
  }
): Promise<{ error: Error | null }> {
  const { error } = await supabase.from("pdf_settings").upsert(
    {
      user_id: userId,
      ...defaultSettings,
      ...settings,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (error) {
    console.warn("[PDF Settings] upsertPdfSettings error:", error);
    return { error };
  }
  return { error: null };
}

const LOGO_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/** Upload logo file to Storage at {userId}/logo.png, overwriting any previous logo. */
export async function uploadPdfLogo(userId: string, file: File): Promise<{ path: string | null; error: Error | null }> {
  return uploadPdfLogoFromBlob(userId, file, file.type || "image/png");
}

/** Upload logo from a Blob (e.g. from Capacitor Camera picker). Persists to Supabase so the logo does not depend on temporary URIs. */
export async function uploadPdfLogoFromBlob(
  userId: string,
  blob: Blob,
  mimeType: string
): Promise<{ path: string | null; error: Error | null }> {
  const path = `${userId}/${LOGO_FILE_NAME}`;
  const contentType = LOGO_MIME_TYPES.includes(mimeType as any) ? mimeType : "image/png";
  if (blob.size > LOGO_MAX_BYTES) {
    return { path: null, error: new Error("Image must be under 2MB.") };
  }
  // Remove old file first so signed-URL caches are invalidated
  await supabase.storage.from(PDF_LOGOS_BUCKET).remove([path]).catch(() => {});
  const { error } = await supabase.storage.from(PDF_LOGOS_BUCKET).upload(path, blob, {
    upsert: true,
    contentType,
  });
  if (error) {
    console.warn("[PDF Settings] uploadPdfLogoFromBlob error:", error);
    return { path: null, error };
  }
  return { path, error: null };
}

/** Get logo file as base64 data URL for use in jsPDF. Returns null if no logo or fetch fails. */
export async function getPdfLogoBase64(userId: string, logoPath: string): Promise<string | null> {
  const { data: signed, error: signError } = await supabase.storage
    .from(PDF_LOGOS_BUCKET)
    .createSignedUrl(logoPath, 60);
  if (signError || !signed?.signedUrl) {
    console.warn("[PDF Settings] createSignedUrl error:", signError);
    return null;
  }
  try {
    const res = await fetch(signed.signedUrl, { cache: "no-store" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const r = new FileReader();
      r.onloadend = () => resolve(typeof r.result === "string" ? r.result : null);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Get public or signed URL for the user's logo (e.g. for preview in settings page). */
export async function getPdfLogoPreviewUrl(userId: string, logoPath: string): Promise<string | null> {
  const { data: signed, error } = await supabase.storage
    .from(PDF_LOGOS_BUCKET)
    .createSignedUrl(logoPath, 3600);
  if (error || !signed?.signedUrl) return null;
  return signed.signedUrl;
}
