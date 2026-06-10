"use client";

import { useCallback, useEffect, useState } from "react";
import {
  clampShareCartQty,
  SHARE_CART_MAX_LINES,
  type ShareCartLine,
} from "./share-cart-types";
import type { VeloProductListItem } from "./velo-products-types";

const storageKey = (userId: string) => `velo-share-cart:${userId}`;

function readCart(userId: string): ShareCartLine[] {
  if (typeof window === "undefined" || !userId) return [];
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (row): row is ShareCartLine =>
          row &&
          typeof row === "object" &&
          typeof (row as ShareCartLine).productId === "string" &&
          typeof (row as ShareCartLine).name === "string" &&
          typeof (row as ShareCartLine).quantity === "number"
      )
      .map((row) => ({
        productId: row.productId.trim(),
        name: row.name.trim(),
        productCode: row.productCode?.trim() || null,
        quantity: clampShareCartQty(row.quantity),
      }))
      .filter((row) => row.productId.length > 0 && row.name.length > 0);
  } catch {
    return [];
  }
}

function writeCart(userId: string, lines: ShareCartLine[]): void {
  if (typeof window === "undefined" || !userId) return;
  try {
    if (lines.length === 0) {
      window.localStorage.removeItem(storageKey(userId));
    } else {
      window.localStorage.setItem(storageKey(userId), JSON.stringify(lines));
    }
  } catch {
    /* quota / private mode */
  }
}

export function useShareCart(userId: string) {
  const [lines, setLines] = useState<ShareCartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setLines(readCart(userId));
    setHydrated(true);
  }, [userId]);

  useEffect(() => {
    if (!hydrated) return;
    writeCart(userId, lines);
  }, [userId, lines, hydrated]);

  const addProduct = useCallback(
    (product: VeloProductListItem, quantity = 1): { ok: true } | { ok: false; reason: "max_lines" } => {
      const qty = clampShareCartQty(quantity);
      let hitMax = false;
      setLines((prev) => {
        const idx = prev.findIndex((l) => l.productId === product.productId);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = {
            ...next[idx]!,
            name: product.name,
            productCode: product.productCode,
            quantity: clampShareCartQty(next[idx]!.quantity + qty),
          };
          return next;
        }
        if (prev.length >= SHARE_CART_MAX_LINES) {
          hitMax = true;
          return prev;
        }
        return [
          ...prev,
          {
            productId: product.productId,
            name: product.name,
            productCode: product.productCode,
            quantity: qty,
          },
        ];
      });
      return hitMax ? { ok: false, reason: "max_lines" } : { ok: true };
    },
    []
  );

  const setQuantity = useCallback((productId: string, quantity: number) => {
    const qty = clampShareCartQty(quantity);
    setLines((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, quantity: qty } : l))
    );
  }, []);

  const removeLine = useCallback((productId: string) => {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  }, []);

  const clearCart = useCallback(() => {
    setLines([]);
  }, []);

  const totalUnits = lines.reduce((sum, l) => sum + l.quantity, 0);

  return {
    lines,
    hydrated,
    totalUnits,
    addProduct,
    setQuantity,
    removeLine,
    clearCart,
  };
}
