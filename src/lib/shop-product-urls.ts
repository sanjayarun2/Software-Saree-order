import { slugifyProductName } from "./product-shop-meta-storage";

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

function normalizeShopBase(url: string): string {
  return (url || "").trim().replace(/\/$/, "");
}

function resolveSlug(input: ShopProductLinkInput): string | null {
  const slug = input.slug?.trim();
  if (slug) return slug;
  if (input.productName?.trim()) return slugifyProductName(input.productName);
  return null;
}

/**
 * Cart-first storefront links. Cart uses productId (stable). Product page uses slug path.
 */
export function buildShopProductLinks(input: ShopProductLinkInput): ShopProductLinks {
  const base = normalizeShopBase(input.shopBaseUrl);
  const productId = encodeURIComponent(input.productId);
  const slug = resolveSlug(input);
  const collectionSlug = input.collectionSlug?.trim();

  const cartUrl = `${base}/cart?add=${productId}&quantity=1`;

  let productUrl = cartUrl;
  if (slug) {
    if (collectionSlug) {
      productUrl = `${base}/collections/${encodeURIComponent(collectionSlug)}/products/${encodeURIComponent(slug)}`;
    } else {
      productUrl = `${base}/products/${encodeURIComponent(slug)}`;
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
