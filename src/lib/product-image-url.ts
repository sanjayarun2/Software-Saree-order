/** Pull a usable image URL from many possible shop/API field shapes. */
export function extractImageUrlFromUnknown(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    const s = raw.trim();
    return /^https?:\/\//i.test(s) || s.startsWith("data:image/") ? s : null;
  }
  if (typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const directKeys = [
    "imageUrl",
    "image_url",
    "thumbnailUrl",
    "thumbnail_url",
    "featuredImageUrl",
    "featured_image_url",
    "photoUrl",
    "photo_url",
    "mediaUrl",
    "media_url",
    "url",
    "src",
  ];
  for (const key of directKeys) {
    const hit = extractImageUrlFromUnknown(o[key]);
    if (hit) return hit;
  }

  for (const key of [
    "image",
    "thumbnail",
    "featuredImage",
    "featured_image",
    "photo",
    "media",
  ]) {
    const hit = extractImageUrlFromUnknown(o[key]);
    if (hit) return hit;
  }

  if (Array.isArray(o.images) && o.images.length) {
    const hit = extractImageUrlFromUnknown(o.images[0]);
    if (hit) return hit;
  }

  return null;
}

/** Pull shop ST code from product name when productCode is missing (e.g. "... ST000225"). */
export function extractProductCodeFromText(
  text: string | null | undefined
): string | null {
  if (!text) return null;
  const match = text.match(/\b(ST\d{3,})\b/i);
  return match ? match[1].toUpperCase() : null;
}
