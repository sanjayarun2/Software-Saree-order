import type { VeloBulkSharedForm, VeloSingleProductForm } from "./velo-products-types";

const SINGLE_KEY = "velo_product_single_draft";
const BULK_KEY = "velo_product_bulk_draft";

export function saveSingleProductDraft(form: VeloSingleProductForm) {
  if (typeof window === "undefined") return;
  const { imageBase64, veloExternalId, ...rest } = form;
  localStorage.setItem(
    SINGLE_KEY,
    JSON.stringify({
      ...rest,
      veloExternalId: veloExternalId || "",
      imageBase64: imageBase64 ? "[saved]" : "",
    })
  );
}

export function loadSingleProductDraft(): VeloSingleProductForm | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SINGLE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as VeloSingleProductForm & {
      externalProductId?: string;
    };
    if (!parsed.veloExternalId && parsed.externalProductId) {
      parsed.veloExternalId = parsed.externalProductId;
    }
    if (parsed.imageBase64 === "[saved]") {
      parsed.imageBase64 = "";
      parsed.imageFileName = "";
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearSingleProductDraft() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SINGLE_KEY);
}

export function saveBulkProductDraft(form: VeloBulkSharedForm) {
  if (typeof window === "undefined") return;
  localStorage.setItem(BULK_KEY, JSON.stringify(form));
}

export function loadBulkProductDraft(): VeloBulkSharedForm | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(BULK_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as VeloBulkSharedForm;
  } catch {
    return null;
  }
}

export function clearBulkProductDraft() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(BULK_KEY);
}
