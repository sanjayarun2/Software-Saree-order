import { Capacitor } from "@capacitor/core";
import { buildCustomerCartShareText, buildShopCartUrl } from "./shop-product-urls";
import type { ShareCartLine } from "./share-cart-types";
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

async function openShareSheet(opts: {
  title: string;
  text: string;
}): Promise<{ copied?: boolean }> {
  const tryNativeShare = async (): Promise<boolean> => {
    if (!navigator.share) return false;
    try {
      // Link is already in `text` (Open cart: …). Do not pass `url` separately —
      // WhatsApp and other apps would show the same link twice.
      await navigator.share({
        title: opts.title,
        text: opts.text,
      });
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
        await Share.share({
          title: opts.title,
          text: opts.text,
          dialogTitle: opts.title,
        });
        return {};
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return {};
    }
  }

  const waUrl = `https://wa.me/?text=${encodeURIComponent(opts.text)}`;
  const opened = window.open(waUrl, "_blank", "noopener,noreferrer");
  if (opened) return {};

  const copied = await copyTextToClipboard(opts.text);
  if (copied) return { copied: true };

  throw new Error("Could not open share. Copy the link manually.");
}

export async function shareCustomerShopCart(opts: {
  lines: ShareCartLine[];
  shopBaseUrl: string;
  orderHeading?: string;
  courierNote?: string;
  cartLinkLabel?: string;
}): Promise<{ copied?: boolean }> {
  if (typeof window === "undefined") return {};
  if (!opts.lines.length) {
    throw new Error("Add at least one product to the order cart.");
  }

  const cartUrl = buildShopCartUrl(
    opts.shopBaseUrl,
    opts.lines.map((l) => ({ productId: l.productId, quantity: l.quantity }))
  );

  const text = buildCustomerCartShareText({
    lines: opts.lines,
    cartUrl,
    orderHeading: opts.orderHeading,
    courierNote: opts.courierNote,
    cartLinkLabel: opts.cartLinkLabel,
  });

  const title =
    opts.lines.length === 1
      ? opts.lines[0]!.name
      : `Order (${opts.lines.reduce((n, l) => n + l.quantity, 0)} items)`;

  return openShareSheet({ title, text });
}

export async function shareProductShopLink(opts: {
  userId?: string;
  product: VeloProductListItem;
  shopBaseUrl: string;
}): Promise<{ copied?: boolean }> {
  if (typeof window === "undefined") return {};

  return shareCustomerShopCart({
    shopBaseUrl: opts.shopBaseUrl,
    lines: [
      {
        productId: opts.product.productId,
        name: opts.product.name,
        productCode: opts.product.productCode,
        quantity: 1,
      },
    ],
  });
}
