import { slugifyProductName } from "./product-shop-meta-storage";
import {
  clampShareCartQty,
  SHARE_CART_MAX_LINES,
  type ShareCartLine,
} from "./share-cart-types";
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

export type ShopCartLineInput = {
  productId: string;
  quantity: number;
};

function resolveSlug(input: ShopProductLinkInput): string | null {
  const slug = input.slug?.trim();
  if (slug) return slug;
  if (input.productName?.trim()) return slugifyProductName(input.productName);
  return null;
}

function normalizeCartLines(lines: ShopCartLineInput[]): ShopCartLineInput[] {
  if (!lines.length) {
    throw new Error("Add at least one product to share.");
  }
  if (lines.length > SHARE_CART_MAX_LINES) {
    throw new Error(`Cart share supports up to ${SHARE_CART_MAX_LINES} products.`);
  }

  const merged = new Map<string, number>();
  for (const row of lines) {
    const productId = row.productId.trim();
    if (!isUsableShopProductId(productId)) {
      throw new Error("A valid product ID is required for each cart line.");
    }
    const qty = clampShareCartQty(row.quantity);
    merged.set(productId, (merged.get(productId) ?? 0) + qty);
  }

  return Array.from(merged.entries()).map(([productId, quantity]) => ({
    productId,
    quantity,
  }));
}

/**
 * Multi-item cart URL for storefront.
 * Format: /cart?items={productId}:{qty},{productId}:{qty}
 * Shop must parse `items` on cart page load (see CartDeepLinkAdd).
 */
export function buildShopCartUrl(
  shopBaseUrl: string,
  lines: ShopCartLineInput[]
): string {
  const normalized = normalizeCartLines(lines);
  const base = normalizeShopBaseUrl(shopBaseUrl);
  const itemsValue = normalized
    .map((l) => `${l.productId}:${l.quantity}`)
    .join(",");
  const params = new URLSearchParams();
  params.set("items", itemsValue);
  return `${base}/cart?${params.toString()}`;
}

/**
 * Cart-first storefront links (single product — uses same items= format).
 */
export function buildShopProductLinks(input: ShopProductLinkInput): ShopProductLinks {
  const productId = input.productId.trim();
  if (!isUsableShopProductId(productId)) {
    throw new Error("A valid product ID is required to build shop links.");
  }

  const base = normalizeShopBaseUrl(input.shopBaseUrl);
  const slug = resolveSlug(input);
  const cartUrl = buildShopCartUrl(base, [{ productId, quantity: 1 }]);

  let productUrl = cartUrl;
  if (slug) {
    productUrl = `${base}/shop/${encodeShopPathSegment(slug)}`;
  }

  return {
    cartUrl,
    productUrl,
    primaryShareUrl: cartUrl,
  };
}

function formatLineLabel(line: Pick<ShareCartLine, "name" | "productCode" | "quantity">): string {
  const code = line.productCode?.trim();
  const codePart = code ? ` (${code})` : "";
  return `${line.name.trim()}${codePart} × ${line.quantity}`;
}

/** Customer WhatsApp body: names + qty only (no prices). Courier note at checkout. */
export function buildCustomerCartShareText(opts: {
  lines: Array<Pick<ShareCartLine, "name" | "productCode" | "quantity">>;
  cartUrl: string;
  orderHeading?: string;
  courierNote?: string;
  cartLinkLabel?: string;
}): string {
  const parts: string[] = [];
  const heading = opts.orderHeading?.trim() || "Your order:";
  parts.push(heading);
  parts.push("");

  opts.lines.forEach((line, i) => {
    parts.push(`${i + 1}. ${formatLineLabel(line)}`);
  });

  parts.push("");
  parts.push(
    opts.courierNote?.trim() ||
      "Courier charges are included in the final price shown at checkout."
  );
  parts.push("");
  parts.push(`${opts.cartLinkLabel?.trim() || "Open cart:"} ${opts.cartUrl}`);

  return parts.join("\n");
}

/** @deprecated Use buildCustomerCartShareText — kept for single-product callers. */
export function buildCustomerWhatsAppShareText(opts: {
  name: string;
  description?: string;
  price?: string;
  productCode?: string | null;
  links: ShopProductLinks;
}): string {
  return buildCustomerCartShareText({
    lines: [
      {
        name: opts.name,
        productCode: opts.productCode ?? null,
        quantity: 1,
      },
    ],
    cartUrl: opts.links.cartUrl,
  });
}
