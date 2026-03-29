"use client";

import React, { createContext, useContext, useMemo, useState } from "react";
import type { DashboardDatePeriod } from "@/lib/dashboard-date-utils";

export type ProductCodesPickDraft = {
  files: File[];
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
