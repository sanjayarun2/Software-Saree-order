"use client";

import React, { createContext, useContext, useMemo, useState } from "react";
import type { VeloBulkSharedForm } from "@/lib/velo-products-types";

export type BulkProductsPickDraft = {
  files: Array<{
    name: string;
    type: string;
    lastModified: number;
    objectUrl: string;
  }>;
  form: VeloBulkSharedForm;
};

type Ctx = {
  pickDraft: BulkProductsPickDraft | null;
  setPickDraft: (d: BulkProductsPickDraft | null) => void;
};

const BulkProductsContext = createContext<Ctx | null>(null);

export function BulkProductsProvider({ children }: { children: React.ReactNode }) {
  const [pickDraft, setPickDraft] = useState<BulkProductsPickDraft | null>(null);
  const value = useMemo(() => ({ pickDraft, setPickDraft }), [pickDraft]);
  return <BulkProductsContext.Provider value={value}>{children}</BulkProductsContext.Provider>;
}

export function useBulkProductsDraft() {
  const v = useContext(BulkProductsContext);
  if (!v) throw new Error("useBulkProductsDraft must be used under BulkProductsProvider");
  return v;
}

export function revokeBulkProductsDraftFiles(
  files: BulkProductsPickDraft["files"] | null | undefined
): void {
  if (!files?.length) return;
  for (const file of files) {
    try {
      URL.revokeObjectURL(file.objectUrl);
    } catch {
      // ignore
    }
  }
}
