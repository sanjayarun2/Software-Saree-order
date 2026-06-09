import { Capacitor } from "@capacitor/core";
import { getProductShopMeta } from "./product-shop-meta-storage";
import { buildCustomerWhatsAppShareText, buildShopProductLinks } from "./shop-product-urls";
import type { VeloProductListItem } from "./velo-products-types";

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function shareProductShopLink(opts: {
  userId?: string;
  product: VeloProductListItem;
  shopBaseUrl: string;
  collectionSlug?: string | null;
  slug?: string | null;
  description?: string;
}): Promise<{ copied?: boolean }> {
  if (typeof window === "undefined") return {};

  let slug = opts.slug ?? opts.product.slug ?? null;
  let collectionSlug = opts.collectionSlug ?? opts.product.collectionSlug ?? null;

  if (opts.userId) {
    const meta = await getProductShopMeta(opts.userId, opts.product.productId);
    slug = meta?.slug ?? slug;
    collectionSlug = meta?.collectionSlug ?? collectionSlug;
  }

  const links = buildShopProductLinks({
    shopBaseUrl: opts.shopBaseUrl,
    productId: opts.product.productId,
    slug,
    productName: opts.product.name,
    collectionSlug,
  });

  const text = buildCustomerWhatsAppShareText({
    name: opts.product.name,
    description: opts.description,
    price: opts.product.price,
    productCode: opts.product.productCode,
    links,
  });

  const title = opts.product.name;

  const tryNativeShare = async (): Promise<boolean> => {
    if (!navigator.share) return false;
    try {
      await navigator.share({ title, text, url: links.primaryShareUrl });
      return true;
    } catch (e) {
      if ((e as Error).name === "AbortError") return true;
      return false;
    }
  };

  if (await tryNativeShare()) return {};

  if (Capacitor.isNativePlatform()) {
    try {
      const { Share } = await import("@capacitor/share");
      const can = await Share.canShare();
      if (can.value) {
        await Share.share({ title, text, url: links.primaryShareUrl, dialogTitle: title });
        return {};
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return {};
    }
  }

  const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
  const opened = window.open(waUrl, "_blank", "noopener,noreferrer");
  if (opened) return {};

  const copied = await copyTextToClipboard(text);
  if (copied) return { copied: true };

  throw new Error("Could not open share. Copy the link manually from product settings.");
}
