import { buildCustomerWhatsAppShareText, buildShopProductLinks } from "./shop-product-urls";
import type { VeloProductListItem } from "./velo-products-types";

export async function shareProductShopLink(opts: {
  product: VeloProductListItem;
  shopBaseUrl: string;
  collectionSlug?: string | null;
  slug?: string | null;
  description?: string;
}): Promise<void> {
  if (typeof window === "undefined") return;

  const links = buildShopProductLinks({
    shopBaseUrl: opts.shopBaseUrl,
    productId: opts.product.productId,
    slug: opts.slug,
    productName: opts.product.name,
    collectionSlug: opts.collectionSlug,
  });

  const text = buildCustomerWhatsAppShareText({
    name: opts.product.name,
    description: opts.description,
    price: opts.product.price,
    productCode: opts.product.productCode,
    links,
  });

  try {
    if (navigator.share) {
      await navigator.share({
        title: opts.product.name,
        text,
        url: links.cartUrl,
      });
      return;
    }
  } catch (e) {
    if ((e as Error).name === "AbortError") return;
  }

  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
}
