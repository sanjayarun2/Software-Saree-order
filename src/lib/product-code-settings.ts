/**
 * Local settings for product-code text overlay (placement, size, color).
 * Persisted in localStorage so they survive page reloads and app restarts.
 */

export type TextPlacement = "top-right" | "top-left" | "bottom-left" | "bottom-right";

export interface ProductCodeSettings {
  placement: TextPlacement;
  /** Additive offset applied on top of the dynamic base size (can be negative). */
  sizeOffset: number;
  color: string;
}

const STORAGE_KEY = "product_code_settings";

const DEFAULTS: ProductCodeSettings = {
  placement: "top-right",
  sizeOffset: 0,
  color: "#dc2626",
};

export function getProductCodeSettings(): ProductCodeSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<ProductCodeSettings>;
    return {
      placement: parsed.placement ?? DEFAULTS.placement,
      sizeOffset: typeof parsed.sizeOffset === "number" ? parsed.sizeOffset : DEFAULTS.sizeOffset,
      color: parsed.color ?? DEFAULTS.color,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveProductCodeSettings(settings: ProductCodeSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function resetProductCodeSettings(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function getDefaultProductCodeSettings(): ProductCodeSettings {
  return { ...DEFAULTS };
}
