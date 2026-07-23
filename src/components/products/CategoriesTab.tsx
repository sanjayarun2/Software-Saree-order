"use client";

import React, { useRef, useState } from "react";
import { BentoCard } from "@/components/ui/BentoCard";
import {
  startUploadProgressTicker,
  UploadProgressOverlay,
} from "@/components/products/UploadProgressOverlay";
import { useLanguage } from "@/lib/language-context";
import { compressImageFile, SINGLE_UPLOAD_PROFILE } from "@/lib/product-image-compress";
import {
  upsertVeloCollection,
  VeloProductsApiError,
} from "@/lib/velo-products-api";
import type { VeloCollection } from "@/lib/velo-products-types";

const inputCls =
  "mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-800";
const labelCls = "text-sm font-medium text-slate-700 dark:text-slate-300";

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
  const fileRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [featuredImageMediaId, setFeaturedImageMediaId] = useState("");
  const [imageBase64, setImageBase64] = useState("");
  const [imageFileName, setImageFileName] = useState("");
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadLabel, setUploadLabel] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setDescription("");
    setFeaturedImageMediaId("");
    setImageBase64("");
    setImageFileName("");
    setExistingImageUrl(null);
    setFieldErrors({});
    if (fileRef.current) fileRef.current.value = "";
  };

  const startEdit = (item: VeloCollection) => {
    setEditingId(item.id);
    setName(item.label);
    setDescription(item.description || "");
    setFeaturedImageMediaId(item.featuredImageId || "");
    setImageBase64("");
    setImageFileName("");
    setExistingImageUrl(item.imageUrl || null);
    setFieldErrors({});
    setError(null);
    setInfo(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onPickImage = async (files: FileList | null) => {
    if (!files?.[0]) return;
    setError(null);
    setUploadBusy(true);
    setUploadLabel(t("Preparing image…"));
    setUploadProgress(8);
    const stopTicker = startUploadProgressTicker(setUploadProgress, 8, 38, 2500);
    try {
      const compressed = await compressImageFile(files[0], SINGLE_UPLOAD_PROFILE);
      stopTicker();
      setUploadProgress(100);
      setImageBase64(compressed.base64);
      setImageFileName(compressed.fileName);
      setFeaturedImageMediaId("");
      setExistingImageUrl(null);
      await new Promise((r) => setTimeout(r, 350));
    } catch (e) {
      stopTicker();
      setError((e as Error).message);
    } finally {
      setUploadBusy(false);
      setUploadProgress(0);
      setUploadLabel("");
    }
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = t("Category name is required.");
    if (!description.trim()) next.description = t("Description is required.");
    const hasImage =
      Boolean(imageBase64.trim()) ||
      Boolean(featuredImageMediaId.trim()) ||
      Boolean(editingId && existingImageUrl);
    if (!hasImage) next.image = t("Category image is required.");
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!validate()) return;

    setSubmitting(true);
    setUploadBusy(true);
    setUploadLabel(editingId ? t("Updating category…") : t("Creating category…"));
    setUploadProgress(20);
    const stopTicker = startUploadProgressTicker(setUploadProgress, 20, 85, 8000);
    try {
      await upsertVeloCollection(userId, {
        id: editingId || undefined,
        name,
        description,
        featuredImageMediaId: featuredImageMediaId || undefined,
        imageBase64: imageBase64 || undefined,
        imageFileName: imageFileName || undefined,
      });
      stopTicker();
      setUploadProgress(100);
      await onRefreshCollections();
      setInfo(editingId ? t("Category updated.") : t("Category created."));
      resetForm();
      await new Promise((r) => setTimeout(r, 250));
    } catch (err) {
      stopTicker();
      const message =
        err instanceof VeloProductsApiError
          ? err.message
          : (err as Error).message || t("Category save failed.");
      setError(message);
    } finally {
      setSubmitting(false);
      setUploadBusy(false);
      setUploadProgress(0);
      setUploadLabel("");
    }
  };

  const previewSrc = imageBase64
    ? imageBase64.startsWith("data:")
      ? imageBase64
      : `data:image/jpeg;base64,${imageBase64}`
    : existingImageUrl;

  return (
    <div className="space-y-4">
      <UploadProgressOverlay
        open={uploadBusy}
        label={uploadLabel}
        progress={uploadProgress}
      />

      <BentoCard className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {editingId ? t("Edit category") : t("Create category")}
          </h2>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="text-sm font-medium text-primary-600 dark:text-primary-400"
            >
              {t("Cancel edit")}
            </button>
          )}
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {t("Same fields as website admin: name, description, and category image. Slug is generated automatically.")}
        </p>

        <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className={labelCls}>{t("Category name")} *</span>
            <input
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
              autoComplete="off"
            />
            {fieldErrors.name && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.name}</p>
            )}
          </label>

          <label className="block sm:col-span-2">
            <span className={labelCls}>{t("Description")} *</span>
            <textarea
              className={`${inputCls} min-h-[96px]`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={submitting}
            />
            {fieldErrors.description && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.description}</p>
            )}
          </label>

          <div className="sm:col-span-2">
            <span className={labelCls}>{t("Category image")} *</span>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void onPickImage(e.target.files)}
            />
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={submitting || uploadBusy}
                onClick={() => fileRef.current?.click()}
                className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                {previewSrc ? t("Change image") : t("Choose image")}
              </button>
              {imageFileName && (
                <span className="text-xs text-slate-500">{imageFileName}</span>
              )}
            </div>
            {fieldErrors.image && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.image}</p>
            )}
            {previewSrc && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewSrc}
                alt=""
                className="mt-3 h-36 w-36 rounded-xl object-cover"
              />
            )}
          </div>

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={submitting || uploadBusy}
              className="rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {editingId ? t("Save category") : t("Create category")}
            </button>
          </div>
        </form>
      </BentoCard>

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
          <p className="text-sm text-slate-500">{t("Loading…")}</p>
        ) : collections.length === 0 ? (
          <p className="text-sm text-slate-500">{t("No categories yet.")}</p>
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
                <button
                  type="button"
                  onClick={() => startEdit(item)}
                  className="shrink-0 rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200"
                >
                  {t("Edit")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </BentoCard>
    </div>
  );
}
