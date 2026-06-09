import { slugifyProductName } from "./product-shop-meta-storage";
import {
  encodeShopPathSegment,
  isUsableShopProductId,
  normalizeShopBaseUrl,
} from "./shop-url-utils";

export type ShopProductLinkInput = {
  shopBaseUrl: string;
  productId: string;
  slug?: string | null;
  productName?: string;
  collectionSlug?: string | null;
};

export type ShopProductLinks = {
  cartUrl: string;
  productUrl: string;
  primaryShareUrl: string;
};

function resolveSlug(input: ShopProductLinkInput): string | null {
  const slug = input.slug?.trim();
  if (slug) return slug;
  if (input.productName?.trim()) return slugifyProductName(input.productName);
  return null;
}

/**
 * Cart-first storefront links.
 * Cart: /cart?add={productId}&quantity=1 (shop reads on cart page mount).
 * Product page: /products/{slug} or /collections/{collection}/products/{slug}.
 */
export function buildShopProductLinks(input: ShopProductLinkInput): ShopProductLinks {
  const productId = input.productId.trim();
  if (!isUsableShopProductId(productId)) {
    throw new Error("A valid product ID is required to build shop links.");
  }

  const base = normalizeShopBaseUrl(input.shopBaseUrl);
  const encodedId = encodeShopPathSegment(productId);
  const slug = resolveSlug(input);
  const collectionSlug = input.collectionSlug?.trim();

  const cartUrl = `${base}/cart?add=${encodedId}&quantity=1`;

  let productUrl = cartUrl;
  if (slug) {
    const encodedSlug = encodeShopPathSegment(slug);
    if (collectionSlug) {
      productUrl = `${base}/collections/${encodeShopPathSegment(collectionSlug)}/products/${encodedSlug}`;
    } else {
      productUrl = `${base}/products/${encodedSlug}`;
    }
  }

  return {
    cartUrl,
    productUrl,
    primaryShareUrl: cartUrl,
  };
}

export function buildCustomerWhatsAppShareText(opts: {
  name: string;
  description?: string;
  price?: string;
  productCode?: string | null;
  links: ShopProductLinks;
}): string {
  const parts: string[] = [];
  if (opts.name.trim()) parts.push(opts.name.trim());
  if (opts.description?.trim()) parts.push(opts.description.trim());
  if (opts.productCode?.trim()) parts.push(`Code: ${opts.productCode.trim()}`);
  if (opts.price?.trim()) parts.push(`Price: ₹${opts.price.trim()}`);
  parts.push(`Order: ${opts.links.cartUrl}`);
  if (opts.links.productUrl !== opts.links.cartUrl) {
    parts.push(`View product: ${opts.links.productUrl}`);
  }
  return parts.join("\n\n");
}
