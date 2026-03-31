"use client";

import React, { createContext, useContext, useMemo, useState } from "react";
import type { DashboardDatePeriod } from "@/lib/dashboard-date-utils";

export type ProductCodesPickDraft = {
  files: Array<{
    name: string;
    type: string;
    lastModified: number;
    objectUrl: string;
  }>;
  period: DashboardDatePeriod;
  customFrom: string;
  customTo: string;
};

type Ctx = {
  pickDraft: ProductCodesPickDraft | null;
  setPickDraft: (d: ProductCodesPickDraft | null) => void;
};

const ProductCodesContext = createContext<Ctx | null>(null);

export function ProductCodesProvider({ children }: { children: React.ReactNode }) {
  const [pickDraft, setPickDraft] = useState<ProductCodesPickDraft | null>(null);
  const value = useMemo(() => ({ pickDraft, setPickDraft }), [pickDraft]);
  return <ProductCodesContext.Provider value={value}>{children}</ProductCodesContext.Provider>;
}

export function useProductCodesDraft() {
  const v = useContext(ProductCodesContext);
  if (!v) throw new Error("useProductCodesDraft must be used under ProductCodesProvider");
  return v;
}

export function revokeProductCodesDraftFiles(
  files: ProductCodesPickDraft["files"] | null | undefined,
): void {
  if (!files?.length) return;
  for (const file of files) {
    try {
      URL.revokeObjectURL(file.objectUrl);
    } catch {
      // ignore invalid / already-revoked URLs
    }
  }
}
