"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  startUploadProgressTicker,
  UploadProgressOverlay,
} from "@/components/products/UploadProgressOverlay";
import { useLanguage } from "@/lib/language-context";
import { compressImageFile, SINGLE_UPLOAD_PROFILE } from "@/lib/product-image-compress";
import { upsertVeloCollection, VeloProductsApiError } from "@/lib/velo-products-api";
import type { VeloCollection } from "@/lib/velo-products-types";
import { useBackdropDismissGuard } from "@/lib/use-backdrop-dismiss-guard";

const inputCls =
  "mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-800";
const labelCls = "text-sm font-medium text-slate-700 dark:text-slate-300";

type CreateCollectionModalProps = {
  open: boolean;
  userId: string;
  onClose: () => void;
  onCreated: (collection: VeloCollection) => void | Promise<void>;
};

export function CreateCollectionModal({
  open,
  userId,
  onClose,
  onCreated,
}: CreateCollectionModalProps) {
  const { t } = useLanguage();
  const shouldDismissBackdrop = useBackdropDismissGuard(open);
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [imageBase64, setImageBase64] = useState("");
  const [imageFileName, setImageFileName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadLabel, setUploadLabel] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setDescription("");
    setImageBase64("");
    setImageFileName("");
    setFieldErrors({});
    setError(null);
    setSubmitting(false);
    setUploadBusy(false);
    setUploadLabel("");
    setUploadProgress(0);
    if (fileRef.current) fileRef.current.value = "";
  }, [open]);

  if (!open) return null;

  const previewSrc = imageBase64
    ? imageBase64.startsWith("data:")
      ? imageBase64
      : `data:image/jpeg;base64,${imageBase64}`
    : null;

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
      await new Promise((r) => setTimeout(r, 250));
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
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!validate()) return;

    setSubmitting(true);
    setUploadBusy(true);
    setUploadLabel(t("Creating category…"));
    setUploadProgress(20);
    const stopTicker = startUploadProgressTicker(setUploadProgress, 20, 85, 8000);
    try {
      const saved = await upsertVeloCollection(userId, {
        name,
        description,
        imageBase64: imageBase64 || undefined,
        imageFileName: imageFileName || undefined,
      });
      stopTicker();
      setUploadProgress(100);
      await onCreated(saved);
      onClose();
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

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 px-3 pb-6 pt-10 sm:items-center sm:p-4"
      role="presentation"
      onClick={(e) => {
        if (submitting || uploadBusy) return;
        if (shouldDismissBackdrop(e.target, e.currentTarget)) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-collection-title"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        className="relative max-h-[min(90dvh,640px)] w-full max-w-md overflow-y-auto rounded-2xl border border-gray-200 bg-white p-5 shadow-xl dark:border-slate-600 dark:bg-slate-800"
      >
        <UploadProgressOverlay
          open={uploadBusy}
          label={uploadLabel}
          progress={uploadProgress}
        />

        <h2
          id="create-collection-title"
          className="text-lg font-bold text-slate-900 dark:text-slate-100"
        >
          {t("Add new collection")}
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {t("Optional — leave empty to use a product photo from this category later.")}
        </p>

        <form onSubmit={(e) => void onSubmit(e)} className="mt-4 space-y-4">
          <label className="block">
            <span className={labelCls}>{t("Category name")} *</span>
            <input
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
              autoComplete="off"
              autoFocus
            />
            {fieldErrors.name && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.name}</p>
            )}
          </label>

          <label className="block">
            <span className={labelCls}>{t("Description")} *</span>
            <textarea
              className={`${inputCls} min-h-[88px]`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={submitting}
            />
            {fieldErrors.description && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.description}</p>
            )}
          </label>

          <div>
            <span className={labelCls}>{t("Category image")}</span>
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
              {imageFileName ? (
                <span className="text-xs text-slate-500">{imageFileName}</span>
              ) : null}
            </div>
            {previewSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewSrc}
                alt=""
                className="mt-3 h-28 w-28 rounded-xl object-cover"
              />
            ) : null}
          </div>

          {error ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </p>
          ) : null}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting || uploadBusy}
              className="min-h-[44px] flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
            >
              {t("Cancel")}
            </button>
            <button
              type="submit"
              disabled={submitting || uploadBusy}
              className="min-h-[44px] flex-1 rounded-xl bg-primary-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {submitting ? t("Loading") : t("Create category")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

type CollectionFieldProps = {
  userId: string;
  collections: VeloCollection[];
  loadingCollections: boolean;
  value: string;
  onChange: (collectionId: string) => void;
  onRefreshCollections: () => void | Promise<void>;
  error?: string;
  inputClassName: string;
  labelClassName: string;
};

/** Existing collections dropdown + Add new collection popup + Refresh. */
export function CollectionFieldWithAdd({
  userId,
  collections,
  loadingCollections,
  value,
  onChange,
  onRefreshCollections,
  error,
  inputClassName,
  labelClassName,
}: CollectionFieldProps) {
  const { t } = useLanguage();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="block">
      <span className={labelClassName}>{t("Collection")} *</span>
      <div className="mt-1 flex flex-wrap gap-2">
        <select
          className={`${inputClassName} mt-0 min-w-0 flex-1`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{t("Select collection")}</option>
          {collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="rounded-xl border border-primary-300 bg-primary-50 px-3 text-sm font-semibold text-primary-700 dark:border-primary-700 dark:bg-primary-950/40 dark:text-primary-300"
        >
          {t("Add new")}
        </button>
        <button
          type="button"
          onClick={() => void onRefreshCollections()}
          disabled={loadingCollections}
          className="rounded-xl border border-gray-200 px-3 text-sm dark:border-slate-600"
        >
          {t("Refresh")}
        </button>
      </div>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}

      <CreateCollectionModal
        open={createOpen}
        userId={userId}
        onClose={() => setCreateOpen(false)}
        onCreated={async (created) => {
          await onRefreshCollections();
          onChange(created.id);
        }}
      />
    </div>
  );
}
