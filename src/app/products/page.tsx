"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BentoCard } from "@/components/ui/BentoCard";
import {
  startUploadProgressTicker,
  UploadProgressOverlay,
} from "@/components/products/UploadProgressOverlay";
import { SizeConfigEditor } from "@/components/products/SizeConfigEditor";
import { TagsInput } from "@/components/products/TagsInput";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import {
  clearBulkProductDraft,
  clearSingleProductDraft,
  loadBulkProductDraft,
  loadSingleProductDraft,
  saveBulkProductDraft,
  saveSingleProductDraft,
} from "@/lib/product-form-draft";
import {
  BULK_UPLOAD_PROFILE,
  compressImageFile,
  recompressBase64Image,
  SINGLE_UPLOAD_PROFILE,
} from "@/lib/product-image-compress";
import { normalizeIsDraft, peekCollectionsCache } from "@/lib/velo-products-cache";
import {
  clearProductSyncLogs,
  listProductSyncLogs,
  type ProductSyncLogEntry,
} from "@/lib/product-sync-logs";
import {
  deleteVeloProduct,
  uploadBulkProductsSequential,
  fetchVeloCollections,
  listVeloProducts,
  peekVeloProductsList,
  prefetchVeloProductsList,
  upsertVeloProduct,
  validateBulkForm,
  validateSingleProductForm,
  VeloProductsApiError,
} from "@/lib/velo-products-api";
import {
  EMPTY_BULK_FORM,
  EMPTY_SINGLE_FORM,
  type VeloBulkSharedForm,
  type VeloCollection,
  type VeloProductListItem,
  type VeloSingleProductForm,
} from "@/lib/velo-products-types";

type TabId = "list" | "single" | "bulk" | "logs";

const TABS: { id: TabId; label: string }[] = [
  { id: "list", label: "Product List" },
  { id: "single", label: "Add Single Product" },
  { id: "bulk", label: "Add Bulk Products" },
  { id: "logs", label: "Sync Logs" },
];

const inputCls =
  "mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-800";
const labelCls = "text-sm font-medium text-slate-700 dark:text-slate-300";

export default function ProductsPage() {
  const { user, loading } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = (searchParams.get("tab") as TabId) || "list";

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [collections, setCollections] = useState<VeloCollection[]>([]);
  const [loadingCollections, setLoadingCollections] = useState(false);
  const [listRefreshKey, setListRefreshKey] = useState(0);

  const setTab = (id: TabId) => {
    router.replace(`/products/?tab=${id}`);
  };

  useEffect(() => {
    if (!loading && !user) router.replace("/login/");
  }, [user, loading, router]);

  const loadCollections = useCallback(
    async (force = false) => {
      if (!user) return;
      const cached = !force ? peekCollectionsCache(user.id) : null;
      if (cached?.length) setCollections(cached);
      setLoadingCollections(!cached?.length);
      try {
        const rows = await fetchVeloCollections(user.id, force);
        setCollections(rows);
      } catch (e) {
        if (!cached?.length) setError((e as Error).message);
      } finally {
        setLoadingCollections(false);
      }
    },
    [user]
  );

  useEffect(() => {
    if (!user) return;
    prefetchVeloProductsList(user.id);
    void loadCollections();
  }, [user, loadCollections]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <ErrorBoundary>
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-4 pb-28 lg:px-10 lg:py-6 lg:pb-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 lg:text-2xl">
            {t("Products")}
          </h1>
          <Link
            href="/settings/api/"
            className="text-sm font-medium text-primary-600 dark:text-primary-400"
          >
            {t("API Settings")}
          </Link>
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-300">
          {t("Manage website products using your Velo API key.")}
        </p>

        {(error || info) && (
          <div
            className={`rounded-xl border px-4 py-3 text-sm ${
              error
                ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
                : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
            }`}
          >
            {error || info}
          </div>
        )}

        <div className="flex gap-2 overflow-x-auto pb-1">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setError(null);
                setInfo(null);
                setTab(item.id);
              }}
              className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                tab === item.id
                  ? "bg-primary-500 text-white"
                  : "border border-gray-200 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              }`}
            >
              {t(item.label)}
            </button>
          ))}
        </div>

        <div className={tab === "list" ? undefined : "hidden"}>
          <ProductListTab
            userId={user.id}
            refreshKey={listRefreshKey}
            onEdit={(product) => {
              setTab("single");
              window.dispatchEvent(
                new CustomEvent("velo-edit-product", { detail: product })
              );
            }}
            setError={setError}
            setInfo={setInfo}
          />
        </div>
        <div className={tab === "single" ? undefined : "hidden"}>
          <ProductSingleTab
            userId={user.id}
            collections={collections}
            loadingCollections={loadingCollections}
            onRefreshCollections={() => void loadCollections(true)}
            setError={setError}
            setInfo={setInfo}
            onSaved={() => {
              setListRefreshKey((k) => k + 1);
              setTab("list");
            }}
          />
        </div>
        <div className={tab === "bulk" ? undefined : "hidden"}>
          <ProductBulkTab
            userId={user.id}
            collections={collections}
            loadingCollections={loadingCollections}
            onRefreshCollections={() => void loadCollections(true)}
            setError={setError}
            setInfo={setInfo}
            onDone={() => {
              setListRefreshKey((k) => k + 1);
              setTab("list");
            }}
          />
        </div>
        <div className={tab === "logs" ? undefined : "hidden"}>
          <ProductSyncLogsTab setInfo={setInfo} />
        </div>
      </div>
    </ErrorBoundary>
  );
}

function ProductListTab({
  userId,
  refreshKey,
  onEdit,
  setError,
  setInfo,
}: {
  userId: string;
  refreshKey: number;
  onEdit: (p: VeloProductListItem) => void;
  setError: (v: string | null) => void;
  setInfo: (v: string | null) => void;
}) {
  const { t } = useLanguage();
  const defaultQuery = { search: "", draft: "all" as const, page: 1, pageSize: 20 };
  const [searchInput, setSearchInput] = useState("");
  const [draftFilter, setDraftFilter] = useState<"all" | "draft" | "published">("all");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [appliedDraft, setAppliedDraft] = useState<"all" | "draft" | "published">("all");
  const [items, setItems] = useState<VeloProductListItem[]>(() => {
    return peekVeloProductsList(userId, defaultQuery)?.products ?? [];
  });
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(
    () => peekVeloProductsList(userId, defaultQuery)?.hasMore ?? false
  );
  const [loadingList, setLoadingList] = useState(
    () => !peekVeloProductsList(userId, defaultQuery)
  );
  const [refreshingList, setRefreshingList] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const mountedRef = useRef(false);

  const listQuery = useCallback(
    (pageNum: number) => ({
      search: appliedSearch,
      draft: appliedDraft,
      page: pageNum,
      pageSize: 20,
    }),
    [appliedSearch, appliedDraft]
  );

  const load = useCallback(
    async (pageNum: number, append: boolean, opts: { background?: boolean } = {}) => {
      const query = listQuery(pageNum);
      const cached = !append && pageNum === 1 ? peekVeloProductsList(userId, query) : null;
      const showCached = cached && !append;

      if (showCached) {
        setItems(cached.products);
        setHasMore(cached.hasMore);
        setPage(pageNum);
      }

      if (opts.background || showCached) {
        setRefreshingList(true);
      } else if (!append || items.length === 0) {
        setLoadingList(true);
      }
      setError(null);

      try {
        const res = await listVeloProducts(userId, query);
        setItems((prev) => (append ? [...prev, ...res.products] : res.products));
        setHasMore(res.hasMore);
        setPage(pageNum);
      } catch (e) {
        if (!showCached && items.length === 0) setError((e as Error).message);
      } finally {
        setLoadingList(false);
        setRefreshingList(false);
      }
    },
    [userId, listQuery, setError, items.length]
  );

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      const snap = peekVeloProductsList(userId, listQuery(1));
      void load(1, false, { background: Boolean(snap) });
      return;
    }
    void load(1, false, { background: items.length > 0 });
  }, [appliedSearch, appliedDraft, refreshKey]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void load(1, false, { background: true });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  const handleDelete = async (productId: string, name: string) => {
    if (!window.confirm(t("Delete product \"{name}\"?").replace("{name}", name))) return;
    setDeletingId(productId);
    setError(null);
    try {
      await deleteVeloProduct(userId, productId);
      setInfo(t("Product deleted."));
      await load(1, false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <BentoCard className="p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={labelCls}>{t("Search")}</span>
            <input
              className={inputCls}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setAppliedSearch(searchInput.trim());
                }
              }}
              placeholder={t("Name or product code")}
            />
          </label>
          <label className="block">
            <span className={labelCls}>{t("Status")}</span>
            <select
              className={inputCls}
              value={draftFilter}
              onChange={(e) => {
                const next = e.target.value as "all" | "draft" | "published";
                setDraftFilter(next);
                setAppliedDraft(next);
              }}
            >
              <option value="all">{t("All")}</option>
              <option value="draft">{t("Draft")}</option>
              <option value="published">{t("Published")}</option>
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setAppliedSearch(searchInput.trim())}
            className="min-h-[44px] rounded-xl bg-primary-500 px-4 text-sm font-semibold text-white"
          >
            {t("Search")}
          </button>
          <button
            type="button"
            onClick={() => void load(1, false, { background: items.length > 0 })}
            className="min-h-[44px] rounded-xl border border-gray-200 px-4 text-sm font-medium dark:border-slate-600"
          >
            {t("Refresh")}
          </button>
          {refreshingList && items.length > 0 && (
            <span className="text-xs text-slate-500">{t("Updating…")}</span>
          )}
        </div>
      </BentoCard>

      {loadingList && items.length === 0 ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
        </div>
      ) : items.length === 0 ? (
        <BentoCard className="p-6 text-center text-sm text-slate-500">
          {t("No products found.")}
        </BentoCard>
      ) : (
        <div className="space-y-3">
          {items.map((p) => (
            <BentoCard key={p.productId} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">{p.name}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {p.productCode || "—"} · {p.collectionName || t("No collection")}
                  </p>
                  <p className="mt-1 text-sm">
                    ₹{p.price} · {t("Stock")}: {p.stock ?? 0}
                  </p>
                  <span
                    className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      normalizeIsDraft(p.isDraft)
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                        : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                    }`}
                  >
                    {normalizeIsDraft(p.isDraft) ? t("Draft") : t("Published")}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onEdit(p)}
                    className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium dark:border-slate-600"
                  >
                    {t("Edit")}
                  </button>
                  <button
                    type="button"
                    disabled={deletingId === p.productId}
                    onClick={() => void handleDelete(p.productId, p.name)}
                    className="rounded-xl border border-red-200 px-3 py-2 text-sm font-medium text-red-600 disabled:opacity-50 dark:border-red-900"
                  >
                    {t("Delete")}
                  </button>
                </div>
              </div>
            </BentoCard>
          ))}
        </div>
      )}

      {hasMore && (
        <button
          type="button"
          disabled={loadingList}
          onClick={() => void load(page + 1, true)}
          className="w-full min-h-[44px] rounded-xl border border-gray-200 bg-white py-3 text-sm font-semibold dark:border-slate-600 dark:bg-slate-800"
        >
          {loadingList ? t("Loading…") : t("Load more")}
        </button>
      )}
    </div>
  );
}

function ProductSingleTab({
  userId,
  collections,
  loadingCollections,
  onRefreshCollections,
  setError,
  setInfo,
  onSaved,
}: {
  userId: string;
  collections: VeloCollection[];
  loadingCollections: boolean;
  onRefreshCollections: () => void;
  setError: (v: string | null) => void;
  setInfo: (v: string | null) => void;
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const [form, setForm] = useState<VeloSingleProductForm>(() => {
    return loadSingleProductDraft() ?? { ...EMPTY_SINGLE_FORM };
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadBusy, setUploadBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      setUploadBusy(false);
      setUploadPhase(null);
      setUploadProgress(0);
    };
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const product = (e as CustomEvent<VeloProductListItem>).detail;
      setForm((prev) => ({
        ...prev,
        productId: product.productId,
        websiteProductCode: product.productCode || "",
        veloExternalId: product.externalProductId || "",
        name: product.name,
        collectionId: product.collectionId || "",
        price: String(product.price),
        stock: product.stock ?? 1,
        isDraft: normalizeIsDraft(product.isDraft),
        imageBase64: "",
        imageFileName: "",
      }));
    };
    window.addEventListener("velo-edit-product", handler);
    return () => window.removeEventListener("velo-edit-product", handler);
  }, []);

  useEffect(() => {
    saveSingleProductDraft(form);
  }, [form]);

  const patch = (patch: Partial<VeloSingleProductForm>) =>
    setForm((prev) => ({ ...prev, ...patch }));

  const onPickImage = async (files: FileList | null) => {
    if (!files?.[0]) return;
    setError(null);
    setUploadBusy(true);
    setUploadPhase(t("Preparing image…"));
    setUploadProgress(8);
    const stopTicker = startUploadProgressTicker(setUploadProgress, 8, 38, 2500);
    try {
      const compressed = await compressImageFile(files[0], SINGLE_UPLOAD_PROFILE);
      stopTicker();
      setUploadProgress(100);
      patch({
        imageBase64: compressed.base64,
        imageFileName: compressed.fileName,
        featuredImageMediaId: "",
      });
      await new Promise((r) => setTimeout(r, 350));
    } catch (e) {
      stopTicker();
      setError((e as Error).message);
    } finally {
      setUploadBusy(false);
      setUploadPhase(null);
      setUploadProgress(0);
    }
  };

  const onSubmit = async () => {
    setError(null);
    setInfo(null);
    const errors = validateSingleProductForm(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setError(t("Please fix the highlighted fields."));
      return;
    }

    setSubmitting(true);
    setUploadBusy(true);
    setUploadPhase(t("Uploading product…"));
    setUploadProgress(42);
    const stopTicker = startUploadProgressTicker(setUploadProgress, 42, 92, 35_000);
    try {
      let imageBase64 = form.imageBase64;
      let imageFileName = form.imageFileName;

      const tryUpsert = () =>
        upsertVeloProduct(userId, {
          productId: form.productId,
          veloExternalId: form.veloExternalId,
          name: form.name,
          description: form.description,
          collectionId: form.collectionId,
          tags: form.tags,
          badge: form.badge,
          rating: form.rating,
          price: form.price,
          stock: form.stock,
          isDraft: normalizeIsDraft(form.isDraft),
          featuredImageMediaId: form.featuredImageMediaId,
          imageBase64,
          imageFileName,
          sizeConfig: form.sizeConfig,
        });

      let res;
      try {
        res = await tryUpsert();
      } catch (firstError) {
        const msg = (firstError as Error).message;
        if (/413|too large/i.test(msg) && imageBase64) {
          const smaller = await recompressBase64Image(imageBase64, imageFileName);
          imageBase64 = smaller.base64;
          imageFileName = smaller.fileName;
          res = await tryUpsert();
        } else {
          throw firstError;
        }
      }

      clearSingleProductDraft();
      setForm({ ...EMPTY_SINGLE_FORM });
      const stCode = res.product?.productCode;
      if (stCode) {
        setInfo(
          res.product?.productId && form.productId
            ? t("Product updated: {code}.").replace("{code}", stCode)
            : t("Product created: {code}.").replace("{code}", stCode)
        );
      } else {
        setInfo(t("Product saved successfully."));
      }
      onSaved();
      stopTicker();
      setUploadProgress(100);
      await new Promise((r) => setTimeout(r, 450));
    } catch (e) {
      stopTicker();
      if (e instanceof VeloProductsApiError) {
        setError(e.message);
        setFieldErrors(e.fieldErrors);
      } else {
        setError((e as Error).message);
      }
    } finally {
      stopTicker();
      setSubmitting(false);
      setUploadBusy(false);
      setUploadPhase(null);
      setUploadProgress(0);
    }
  };

  return (
    <>
      <UploadProgressOverlay
        open={uploadBusy}
        label={uploadPhase ?? t("Uploading...")}
        progress={uploadProgress}
      />
      <BentoCard className="space-y-4 p-4">
      {!form.productId ? (
        <p className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
          {t("Website assigns the next ST product code automatically (same as shop admin).")}
        </p>
      ) : form.websiteProductCode ? (
        <label className="block">
          <span className={labelCls}>{t("Product code")}</span>
          <input
            className={`${inputCls} bg-slate-100 dark:bg-slate-900`}
            value={form.websiteProductCode}
            readOnly
          />
        </label>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className={labelCls}>{t("Name")} *</span>
          <input className={inputCls} value={form.name} onChange={(e) => patch({ name: e.target.value })} />
          {fieldErrors.name && <p className="mt-1 text-xs text-red-600">{fieldErrors.name}</p>}
        </label>
        <label className="block sm:col-span-2">
          <span className={labelCls}>{t("Description")}</span>
          <textarea
            className={inputCls}
            rows={3}
            value={form.description}
            onChange={(e) => patch({ description: e.target.value })}
          />
        </label>
        <label className="block">
          <span className={labelCls}>{t("Collection")} *</span>
          <div className="mt-1 flex gap-2">
            <select
              className={`${inputCls} mt-0 flex-1`}
              value={form.collectionId}
              onChange={(e) => patch({ collectionId: e.target.value })}
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
              onClick={onRefreshCollections}
              disabled={loadingCollections}
              className="rounded-xl border border-gray-200 px-3 text-sm dark:border-slate-600"
            >
              {t("Refresh")}
            </button>
          </div>
          {fieldErrors.collectionId && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.collectionId}</p>
          )}
        </label>
        <label className="block">
          <span className={labelCls}>{t("Badge")}</span>
          <select
            className={inputCls}
            value={form.badge}
            onChange={(e) => patch({ badge: e.target.value as VeloSingleProductForm["badge"] })}
          >
            <option value="none">{t("None")}</option>
            <option value="new_product">{t("New product")}</option>
            <option value="best_sale">{t("Best sale")}</option>
            <option value="featured">{t("Featured")}</option>
          </select>
        </label>
        <label className="block">
          <span className={labelCls}>{t("Rating")}</span>
          <input className={inputCls} value={form.rating} onChange={(e) => patch({ rating: e.target.value })} />
        </label>
        <label className="block">
          <span className={labelCls}>{t("Price")} *</span>
          <input className={inputCls} value={form.price} onChange={(e) => patch({ price: e.target.value })} />
          {fieldErrors.price && <p className="mt-1 text-xs text-red-600">{fieldErrors.price}</p>}
        </label>
        <label className="block">
          <span className={labelCls}>{t("Stock")}</span>
          <input
            type="number"
            min={0}
            className={inputCls}
            value={form.stock}
            onChange={(e) => patch({ stock: Number(e.target.value) || 0 })}
          />
        </label>
        <label className="flex items-center gap-2 sm:col-span-2">
          <input
            type="checkbox"
            checked={!normalizeIsDraft(form.isDraft)}
            onChange={(e) => patch({ isDraft: !e.target.checked })}
          />
          <span className={labelCls}>{t("Publish on website")}</span>
        </label>
        <p className="text-xs text-slate-500 sm:col-span-2">
          {normalizeIsDraft(form.isDraft)
            ? t("This product is saved as draft and hidden on the website.")
            : t("This product will be visible on the website.")}
        </p>
        <div className="sm:col-span-2">
          <span className={labelCls}>{t("Tags")}</span>
          <TagsInput tags={form.tags} onChange={(tags) => patch({ tags })} disabled={submitting} />
        </div>
        <div className="sm:col-span-2">
          <span className={labelCls}>{t("Product image")} {!form.productId ? "*" : ""}</span>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void onPickImage(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="mt-2 min-h-[44px] rounded-xl border border-dashed border-gray-300 px-4 py-2 text-sm dark:border-slate-600"
          >
            {form.imageFileName || t("Choose image")}
          </button>
          {fieldErrors.image && <p className="mt-1 text-xs text-red-600">{fieldErrors.image}</p>}
        </div>
        <div className="sm:col-span-2">
          <SizeConfigEditor
            value={form.sizeConfig}
            onChange={(sizeConfig) => patch({ sizeConfig })}
            disabled={submitting}
          />
          {fieldErrors.sizeConfig && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.sizeConfig}</p>
          )}
        </div>
      </div>

      <button
        type="button"
        disabled={submitting}
        onClick={() => void onSubmit()}
        className="min-h-[44px] w-full rounded-xl bg-primary-500 px-4 py-3 text-base font-semibold text-white disabled:opacity-50"
      >
        {submitting ? t("Saving…") : form.productId ? t("Update product") : t("Create product")}
      </button>
    </BentoCard>
    </>
  );
}

function ProductBulkTab({
  userId,
  collections,
  loadingCollections,
  onRefreshCollections,
  setError,
  setInfo,
  onDone,
}: {
  userId: string;
  collections: VeloCollection[];
  loadingCollections: boolean;
  onRefreshCollections: () => void;
  setError: (v: string | null) => void;
  setInfo: (v: string | null) => void;
  onDone: () => void;
}) {
  const { t } = useLanguage();
  const [form, setForm] = useState<VeloBulkSharedForm>(() => loadBulkProductDraft() ?? { ...EMPTY_BULK_FORM });
  const [images, setImages] = useState<{ fileName: string; base64: string }[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      setUploadBusy(false);
      setSubmitting(false);
      setPhase(null);
      setProgress(0);
    };
  }, []);

  useEffect(() => {
    saveBulkProductDraft(form);
  }, [form]);

  const patch = (p: Partial<VeloBulkSharedForm>) => setForm((prev) => ({ ...prev, ...p }));

  const onPickImages = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    setUploadBusy(true);
    setSubmitting(false);
    setPhase(t("Preparing images"));
    setProgress(2);
    const next: { fileName: string; base64: string }[] = [];
    const list = Array.from(files).slice(0, 50);
    for (let i = 0; i < list.length; i++) {
      setProgress(Math.max(2, Math.round(((i + 0.15) / list.length) * 40)));
      try {
        const c = await compressImageFile(list[i], BULK_UPLOAD_PROFILE);
        next.push({ fileName: c.fileName, base64: c.base64 });
        setProgress(Math.round(((i + 1) / list.length) * 40));
      } catch (e) {
        setError((e as Error).message);
        setUploadBusy(false);
        setPhase(null);
        setProgress(0);
        return;
      }
    }
    setImages((prev) => [...prev, ...next].slice(0, 50));
    setProgress(100);
    await new Promise((r) => setTimeout(r, 350));
    setUploadBusy(false);
    setPhase(null);
    setProgress(0);
  };

  const onSubmit = async () => {
    setError(null);
    setInfo(null);
    const errors = validateBulkForm({
      namePrefix: form.namePrefix,
      collectionId: form.collectionId,
      price: form.price,
      stock: form.stock,
      imageCount: images.length,
      sizeConfig: form.sizeConfig,
    });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setError(t("Please fix the highlighted fields."));
      return;
    }

    setSubmitting(true);
    setUploadBusy(true);
    setProgress(5);

    try {
      const result = await uploadBulkProductsSequential(userId, {
        namePrefix: form.namePrefix,
        description: form.description,
        collectionId: form.collectionId,
        tags: form.tags,
        badge: form.badge,
        rating: form.rating,
        price: form.price,
        stock: form.stock,
        isDraft: form.isDraft,
        sizeConfig: form.sizeConfig,
        images: images.map((img) => ({
          imageBase64: img.base64,
          imageFileName: img.fileName,
        })),
        onProgress: (p) => {
          setPhase(
            t("Uploading product {current}/{total}")
              .replace("{current}", String(p.current))
              .replace("{total}", String(p.total))
          );
          setProgress(p.percent);
        },
        recompressImage: async (base64, fileName) => {
          const smaller = await recompressBase64Image(base64, fileName);
          return { base64: smaller.base64, fileName: smaller.fileName };
        },
      });

      setPhase(t("Creating products…"));
      setProgress(100);
      await new Promise((r) => setTimeout(r, 450));
      clearBulkProductDraft();
      setImages([]);
      setForm({ ...EMPTY_BULK_FORM });

      const warnings = [...result.warnings, ...result.failures];
      const warnText =
        warnings.length > 0
          ? t(" {count} warning(s).").replace("{count}", String(warnings.length))
          : "";
      const codePreview =
        result.createdCodes.length > 0
          ? ` ${result.createdCodes.slice(0, 5).join(", ")}${result.createdCodes.length > 5 ? "…" : ""}`
          : "";
      setInfo(
        t("Created {count} product(s).").replace("{count}", String(result.totalCreated)) +
          codePreview +
          warnText
      );
      if (result.failures.length > 0) {
        setError(result.failures.slice(0, 3).join(" "));
      }
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
      setUploadBusy(false);
      setPhase(null);
      setProgress(0);
    }
  };

  return (
    <div className="space-y-4">
      <UploadProgressOverlay
        open={uploadBusy}
        label={phase ?? t("Uploading...")}
        progress={progress}
      />

      <BentoCard className="space-y-4 p-4">
        <p className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
          {t("Each image gets the next website ST code in order (shared with shop admin).")}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className={labelCls}>{t("Name prefix")} *</span>
            <input
              className={inputCls}
              value={form.namePrefix}
              onChange={(e) => patch({ namePrefix: e.target.value })}
              placeholder={t("e.g. Soft Silk Saree")}
            />
            {fieldErrors.namePrefix && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.namePrefix}</p>
            )}
          </label>
          <label className="block sm:col-span-2">
            <span className={labelCls}>{t("Description")}</span>
            <textarea
              className={inputCls}
              rows={2}
              value={form.description}
              onChange={(e) => patch({ description: e.target.value })}
            />
          </label>
          <label className="block">
            <span className={labelCls}>{t("Collection")} *</span>
            <div className="mt-1 flex gap-2">
              <select
                className={`${inputCls} mt-0 flex-1`}
                value={form.collectionId}
                onChange={(e) => patch({ collectionId: e.target.value })}
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
                onClick={onRefreshCollections}
                disabled={loadingCollections}
                className="rounded-xl border border-gray-200 px-3 text-sm dark:border-slate-600"
              >
                {t("Refresh")}
              </button>
            </div>
          </label>
          <label className="block">
            <span className={labelCls}>{t("Price")} *</span>
            <input className={inputCls} value={form.price} onChange={(e) => patch({ price: e.target.value })} />
          </label>
          <label className="block">
            <span className={labelCls}>{t("Stock")}</span>
            <input
              type="number"
              min={0}
              className={inputCls}
              value={form.stock}
              onChange={(e) => patch({ stock: Number(e.target.value) || 0 })}
            />
          </label>
          <label className="block">
            <span className={labelCls}>{t("Badge")}</span>
            <select
              className={inputCls}
              value={form.badge}
              onChange={(e) => patch({ badge: e.target.value as VeloBulkSharedForm["badge"] })}
            >
              <option value="none">{t("None")}</option>
              <option value="new_product">{t("New product")}</option>
              <option value="best_sale">{t("Best sale")}</option>
              <option value="featured">{t("Featured")}</option>
            </select>
          </label>
          <label className="flex items-center gap-2 sm:col-span-2">
            <input
              type="checkbox"
              checked={!normalizeIsDraft(form.isDraft)}
              onChange={(e) => patch({ isDraft: !e.target.checked })}
            />
            <span className={labelCls}>{t("Publish on website")}</span>
          </label>
          <div className="sm:col-span-2">
            <TagsInput tags={form.tags} onChange={(tags) => patch({ tags })} disabled={submitting} />
          </div>
          <div className="sm:col-span-2">
            <SizeConfigEditor
              value={form.sizeConfig}
              onChange={(sizeConfig) => patch({ sizeConfig })}
              disabled={submitting}
            />
          </div>
        </div>

        <div>
          <span className={labelCls}>{t("Images")} * ({images.length}/50)</span>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => void onPickImages(e.target.files)}
          />
          <button
            type="button"
            disabled={submitting}
            onClick={() => fileRef.current?.click()}
            className="mt-2 min-h-[44px] rounded-xl border border-dashed border-gray-300 px-4 py-2 text-sm dark:border-slate-600"
          >
            {t("Select images from device")}
          </button>
          {fieldErrors.images && <p className="mt-1 text-xs text-red-600">{fieldErrors.images}</p>}
          {images.length > 0 && (
            <p className="mt-2 text-xs text-slate-500">
              {images.map((i) => i.fileName).slice(0, 5).join(", ")}
              {images.length > 5 ? ` +${images.length - 5}` : ""}
            </p>
          )}
        </div>

        <button
          type="button"
          disabled={submitting}
          onClick={() => void onSubmit()}
          className="min-h-[44px] w-full rounded-xl bg-primary-500 px-4 py-3 text-base font-semibold text-white disabled:opacity-50"
        >
          {submitting ? t("Creating products…") : t("Create bulk products")}
        </button>
      </BentoCard>
    </div>
  );
}

function ProductSyncLogsTab({ setInfo }: { setInfo: (v: string | null) => void }) {
  const { t } = useLanguage();
  const [logs, setLogs] = useState<ProductSyncLogEntry[]>([]);

  useEffect(() => {
    setLogs(listProductSyncLogs());
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            clearProductSyncLogs();
            setLogs([]);
            setInfo(t("Sync logs cleared."));
          }}
          className="rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-slate-600"
        >
          {t("Clear logs")}
        </button>
      </div>
      {logs.length === 0 ? (
        <BentoCard className="p-6 text-center text-sm text-slate-500">{t("No sync logs yet.")}</BentoCard>
      ) : (
        logs.map((log) => (
          <BentoCard key={log.id} className="p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">{log.action}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  log.ok
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40"
                    : "bg-red-100 text-red-800 dark:bg-red-900/40"
                }`}
              >
                {log.ok ? t("OK") : t("Failed")}
              </span>
            </div>
            <p className="mt-1 text-slate-600 dark:text-slate-300">{log.message}</p>
            <p className="mt-1 text-xs text-slate-500">
              {new Date(log.at).toLocaleString()} · {log.requestId.slice(0, 8)}
            </p>
            {log.details && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{log.details}</p>}
          </BentoCard>
        ))
      )}
    </div>
  );
}
