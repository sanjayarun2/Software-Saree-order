"use client";

import React, { useState } from "react";
import { BentoCard } from "@/components/ui/BentoCard";
import { CategoryFormModal } from "@/components/products/CategoryFormModal";
import { UploadProgressOverlay } from "@/components/products/UploadProgressOverlay";
import { useLanguage } from "@/lib/language-context";
import { deferModalOpen } from "@/lib/use-backdrop-dismiss-guard";
import {
  deleteVeloCollection,
  VeloProductsApiError,
} from "@/lib/velo-products-api";
import type { VeloCollection } from "@/lib/velo-products-types";

type CategoriesTabProps = {
  userId: string;
  collections: VeloCollection[];
  loadingCollections: boolean;
  onRefreshCollections: () => Promise<void> | void;
  setError: (v: string | null) => void;
  setInfo: (v: string | null) => void;
};

export function CategoriesTab({
  userId,
  collections,
  loadingCollections,
  onRefreshCollections,
  setError,
  setInfo,
}: CategoriesTabProps) {
  const { t } = useLanguage();
  const [formOpen, setFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<VeloCollection | null>(
    null
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletePercent, setDeletePercent] = useState(0);
  const [deleteLabel, setDeleteLabel] = useState("");

  const openCreate = () => {
    setError(null);
    setInfo(null);
    setEditingCategory(null);
    deferModalOpen(() => setFormOpen(true));
  };

  const openEdit = (item: VeloCollection) => {
    setError(null);
    setInfo(null);
    setEditingCategory(item);
    deferModalOpen(() => setFormOpen(true));
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingCategory(null);
  };

  const onDelete = async (item: VeloCollection) => {
    const ok = window.confirm(
      t(
        "Delete this category? Products in it will be removed or archived (same as website admin). This cannot be undone."
      )
    );
    if (!ok) return;

    setError(null);
    setInfo(null);
    setDeletingId(item.id);
    setDeletePercent(5);
    setDeleteLabel(t("Deleting category…"));
    try {
      const result = await deleteVeloCollection(userId, item.id, (p) => {
        setDeletePercent(p.percent);
        setDeleteLabel(
          p.done
            ? t("Category deleted.")
            : t("Removing products in category…")
        );
      });
      await onRefreshCollections();
      if (editingCategory?.id === item.id) closeForm();
      const archivedNote =
        result.archivedCount > 0
          ? ` ${result.archivedCount} ${t("with order history were archived.")}`
          : "";
      setInfo(`${t("Category deleted.")}${archivedNote}`);
    } catch (err) {
      const message =
        err instanceof VeloProductsApiError
          ? err.message
          : (err as Error).message || t("Category delete failed.");
      setError(message);
    } finally {
      setDeletingId(null);
      setDeletePercent(0);
      setDeleteLabel("");
    }
  };

  return (
    <div className="relative space-y-4">
      <UploadProgressOverlay
        open={Boolean(deletingId)}
        label={deleteLabel || t("Deleting category…")}
        progress={deletePercent}
      />

      <BentoCard className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {t("Existing categories")}
          </h2>
          <button
            type="button"
            onClick={() => void onRefreshCollections()}
            disabled={loadingCollections}
            className="text-sm font-medium text-primary-600 dark:text-primary-400 disabled:opacity-60"
          >
            {loadingCollections ? t("Loading…") : t("Refresh")}
          </button>
        </div>

        {loadingCollections && collections.length === 0 ? (
          <div className="flex justify-center py-10">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
          </div>
        ) : collections.length === 0 ? (
          <div className="space-y-3 py-6 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t("No categories yet.")}
            </p>
            <button
              type="button"
              onClick={openCreate}
              className="min-h-[44px] rounded-xl bg-primary-500 px-4 text-sm font-semibold text-white"
            >
              {t("New category")}
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-slate-700">
            {collections.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
              >
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.imageUrl}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-400 dark:bg-slate-700">
                    —
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                    {item.label}
                  </p>
                  {item.description ? (
                    <p className="mt-0.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                      {item.description}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(item)}
                    disabled={Boolean(deletingId)}
                    className="min-h-[44px] rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200"
                  >
                    {t("Edit")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void onDelete(item)}
                    disabled={Boolean(deletingId)}
                    className="min-h-[44px] rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-50 dark:border-red-900 dark:text-red-300"
                  >
                    {deletingId === item.id ? t("Deleting…") : t("Delete")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </BentoCard>

      {/* FAB: list-first create pattern; clear of mobile bottom nav */}
      {!formOpen && collections.length > 0 ? (
        <div className="pointer-events-none fixed bottom-24 right-4 z-50 md:bottom-8 md:right-8">
          <button
            type="button"
            onClick={openCreate}
            disabled={Boolean(deletingId)}
            className="pointer-events-auto inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-primary-500 px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-primary-600 active:bg-primary-600 disabled:opacity-50"
            aria-label={t("New category")}
          >
            <span className="text-xl font-bold leading-none" aria-hidden>
              +
            </span>
            {t("New category")}
          </button>
        </div>
      ) : null}

      <CategoryFormModal
        open={formOpen}
        userId={userId}
        category={editingCategory}
        onClose={closeForm}
        onSaved={async () => {
          await onRefreshCollections();
          setInfo(
            editingCategory ? t("Category updated.") : t("Category created.")
          );
        }}
      />
    </div>
  );
}
