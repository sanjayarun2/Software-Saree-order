import {
  getPrimaryEnabledIntegration,
  type ApiIntegrationRow,
} from "./api-settings-supabase";
import { appendProductSyncLog } from "./product-sync-logs";
import { supabase } from "./supabase";
import { isBase64WithinUploadLimit } from "./product-image-compress";
import {
  invalidateProductsListCache,
  normalizeIsDraft,
  normalizeProductListItem,
  peekCollectionsCache,
  peekVeloProductsList,
  readProductsListCache,
  writeCollectionsCache,
  writeProductsListCache,
} from "./velo-products-cache";
import {
  getProductShopMetaMap,
  saveProductShopMeta,
  slugifyProductName,
} from "./product-shop-meta-storage";
import type {
  VeloCollection,
  VeloProductListItem,
  VeloProductsAction,
  VeloProductsResponse,
  VeloSizeConfig,
} from "./velo-products-types";

const VELO_PRODUCTS_PROXY = "velo-website-products";
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 800;
const COLLECTIONS_CACHE_MS = 5 * 60 * 1000;

let collectionsCache: { at: number; items: VeloCollection[] } | null = null;
const listInflight = new Map<
  string,
  Promise<{ products: VeloProductListItem[]; total: number; hasMore: boolean }>
>();

function listQueryKey(
  userId: string,
  opts: {
    search?: string;
    draft?: string;
    page?: number;
    pageSize?: number;
  }
) {
  return [
    userId,
    opts.draft ?? "all",
    opts.page ?? 1,
    opts.pageSize ?? 20,
    (opts.search ?? "").trim().toLowerCase(),
  ].join("|");
}

export class VeloProductsApiError extends Error {
  readonly fieldErrors: Record<string, string>;

  constructor(message: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = "VeloProductsApiError";
    this.fieldErrors = fieldErrors;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isPayloadTooLargeMessage(message: string) {
  return /413|payload too large|entity too large|content too large|body exceeded|request entity too large|too large/i.test(
    message
  );
}

function isRetryable(status: number, message: string) {
  if (status === 413 || isPayloadTooLargeMessage(message)) return false;
  if (status >= 500) return true;
  return /network|timeout|failed to fetch|load failed|temporarily/i.test(message);
}

function payloadTooLargeError() {
  return new VeloProductsApiError(
    "Photo too large to upload (413). We compressed it automatically — please retry. If it continues, pick a smaller image."
  );
}

function newRequestId() {
  return crypto.randomUUID();
}

/** Hidden Velo-side id for upsert mapping (not the shop ST code). */
export function newVeloExternalId(suffix?: string) {
  const id = crypto.randomUUID();
  return suffix ? `velo-${suffix}-${id}` : `velo-${id}`;
}

function resolveExternalProductId(opts: {
  productId?: string;
  veloExternalId?: string;
}) {
  const trimmed = opts.veloExternalId?.trim();
  if (trimmed) return trimmed;
  if (opts.productId) return `velo-pid-${opts.productId}`;
  return newVeloExternalId();
}

async function getPrimaryIntegration(userId: string): Promise<ApiIntegrationRow> {
  const row = await getPrimaryEnabledIntegration(userId);
  if (!row) {
    throw new VeloProductsApiError(
      "No API key configured. Add your Velo API key in Settings → API Settings."
    );
  }
  return row;
}

function hasUsableProductImage(imageBase64: string, featuredImageMediaId: string) {
  const base64 = imageBase64.trim();
  return Boolean(
    featuredImageMediaId.trim() ||
      (base64 && base64 !== "[saved]" && base64.length > 64)
  );
}

function extractInvokeErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;

  if ("error" in payload && payload.error) {
    return String(payload.error);
  }

  const res = payload as VeloProductsResponse;
  if (res.message?.trim()) return res.message.trim();
  if (res.errors?.length) return res.errors[0];

  if ("details" in payload && payload.details && typeof payload.details === "object") {
    const details = payload.details as VeloProductsResponse;
    if (details.message?.trim()) return details.message.trim();
    if (details.errors?.length) return details.errors[0];
  }

  return null;
}

function throwInvokeFailure(payload: unknown, invokeError: Error | null): never {
  const message = extractInvokeErrorMessage(payload);
  const invokeMsg = invokeError?.message ?? "";
  const status =
    invokeError &&
    "context" in invokeError &&
    typeof (invokeError as { context?: { status?: number } }).context?.status === "number"
      ? (invokeError as { context: { status: number } }).context.status
      : payload && typeof payload === "object" && "status" in payload
        ? Number((payload as { status: unknown }).status) || 0
        : 0;

  if (status === 413 || isPayloadTooLargeMessage(`${message} ${invokeMsg}`)) {
    throw payloadTooLargeError();
  }

  if (message) {
    if (isPayloadTooLargeMessage(message)) throw payloadTooLargeError();
    if (/image|imageBase64|featuredImageMediaId/i.test(message)) {
      throw new VeloProductsApiError(
        "Product image is invalid or missing. Pick the photo again and retry."
      );
    }
    throw new VeloProductsApiError(message);
  }

  if (invokeError) {
    if (/function not found|404|not deployed/i.test(invokeError.message)) {
      throw new VeloProductsApiError(
        "Products API proxy not deployed. Deploy velo-website-products in Supabase."
      );
    }
    if (isPayloadTooLargeMessage(invokeError.message)) throw payloadTooLargeError();
    throw new VeloProductsApiError(invokeError.message);
  }

  throw new VeloProductsApiError("Empty response from server.");
}

async function invokeVeloProducts(
  integration: ApiIntegrationRow,
  action: VeloProductsAction,
  requestId: string,
  data: Record<string, unknown>
): Promise<VeloProductsResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const { data: payload, error } = await supabase.functions.invoke(
      VELO_PRODUCTS_PROXY,
      {
        body: {
          integration_id: integration.id,
          action,
          requestId,
          data,
        },
      }
    );

    if (!payload || typeof payload !== "object") {
      if (error) throwInvokeFailure(payload, error);
      throw new VeloProductsApiError("Empty response from server.");
    }

    const res = payload as VeloProductsResponse;
    const proxyFailed =
      Boolean(error) ||
      ("ok" in payload && payload.ok === false) ||
      ("error" in payload && Boolean(payload.error));

    if (proxyFailed) {
      throwInvokeFailure(payload, error);
    }

    if (!res.ok) {
      throwInvokeFailure(payload, error);
    }

    return res;
  } catch (e) {
    if (e instanceof VeloProductsApiError) throw e;
    if ((e as Error).name === "AbortError") {
      throw new VeloProductsApiError("Request timed out. Check your connection and try again.");
    }
    throw new VeloProductsApiError((e as Error).message || "Connection failed.");
  } finally {
    clearTimeout(timer);
  }
}

async function requestWithRetry(
  integration: ApiIntegrationRow,
  action: VeloProductsAction,
  requestId: string,
  data: Record<string, unknown>
): Promise<VeloProductsResponse> {
  let lastError = "Request failed.";

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await invokeVeloProducts(integration, action, requestId, data);
      appendProductSyncLog({
        action,
        requestId,
        ok: res.ok,
        message: res.message ?? (res.ok ? "Success" : "Failed"),
        details: res.errors?.join("; "),
      });
      if (!res.ok) {
        throw new VeloProductsApiError(
          res.message ?? res.errors?.[0] ?? "Request failed."
        );
      }
      return res;
    } catch (e) {
      lastError = (e as Error).message;
      const retryable = isRetryable(0, lastError);
      if (!retryable || attempt === MAX_RETRIES - 1) {
        appendProductSyncLog({
          action,
          requestId,
          ok: false,
          message: lastError,
        });
        throw e instanceof VeloProductsApiError
          ? e
          : new VeloProductsApiError(lastError);
      }
      await sleep(RETRY_BASE_MS * (attempt + 1));
    }
  }

  throw new VeloProductsApiError(lastError);
}

export { peekCollectionsCache, peekVeloProductsList } from "./velo-products-cache";

async function fetchVeloProductsList(
  userId: string,
  opts: {
    search?: string;
    draft?: "all" | "draft" | "published";
    page?: number;
    pageSize?: number;
  } = {}
): Promise<{ products: VeloProductListItem[]; total: number; hasMore: boolean }> {
  const integration = await getPrimaryIntegration(userId);
  const requestId = newRequestId();
  const res = await requestWithRetry(integration, "list", requestId, {
    search: opts.search ?? "",
    draft: opts.draft ?? "all",
    page: opts.page ?? 1,
    pageSize: opts.pageSize ?? 20,
  });
  const metaMap = await getProductShopMetaMap(userId);
  const collections = peekCollectionsCache(userId) ?? [];
  const result = {
    products: (res.products ?? []).map((row) => {
      const item = normalizeProductListItem(row as VeloProductListItem);
      const meta = metaMap[item.productId];
      const collectionSlug =
        meta?.collectionSlug ??
        collections.find((c) => c.id === item.collectionId)?.slug ??
        item.collectionSlug ??
        null;
      const slug =
        meta?.slug ??
        item.slug ??
        (item.name ? slugifyProductName(item.name) : null);
      return { ...item, slug, collectionSlug };
    }),
    total: res.total ?? 0,
    hasMore: res.hasMore ?? false,
  };
  writeProductsListCache(userId, opts, result);
  return result;
}

/**
 * Batch-resolve packing photos by shop product ids (draft + published).
 * Prefer this over many list searches when order lines already carry productId.
 */
export async function resolveVeloProductImages(
  userId: string,
  productIds: string[]
): Promise<VeloProductListItem[]> {
  const ids = [...new Set(productIds.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) return [];

  const integration = await getPrimaryIntegration(userId);
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await invokeVeloProducts(
        integration,
        "resolveImages",
        newRequestId(),
        { productIds: ids }
      );
      return (res.products ?? []).map(normalizeProductListItem);
    } catch (e) {
      lastError = e as Error;
      const msg = (e as Error).message || "";
      if (/unknown action|resolveImages/i.test(msg)) break;
      if (e instanceof VeloProductsApiError && !isRetryable(0, msg)) break;
      if (attempt < MAX_RETRIES - 1) await sleep(RETRY_BASE_MS * (attempt + 1));
    }
  }

  // Older shop deploys may not know resolveImages — fall back to per-id list.
  if (lastError && /unknown action|resolveImages|not found/i.test(lastError.message || "")) {
    const out: VeloProductListItem[] = [];
    for (const id of ids) {
      try {
        const { products } = await listVeloProducts(
          userId,
          { search: id, page: 1, pageSize: 5, draft: "all" },
          { forceRefresh: true }
        );
        const match = products.find((p) => p.productId === id);
        if (match) out.push(match);
      } catch {
        /* continue */
      }
    }
    return out;
  }

  // Soft-fail: packing UI can still try list searches per line.
  console.warn(
    "[resolveVeloProductImages]",
    lastError?.message || "failed"
  );
  return [];
}

export async function listVeloProducts(
  userId: string,
  opts: {
    search?: string;
    draft?: "all" | "draft" | "published";
    page?: number;
    pageSize?: number;
  } = {},
  fetchOpts: { forceRefresh?: boolean } = {}
): Promise<{
  products: VeloProductListItem[];
  total: number;
  hasMore: boolean;
  fromCache?: boolean;
}> {
  if (!fetchOpts.forceRefresh) {
    const fresh = readProductsListCache(userId, opts);
    if (fresh) {
      return {
        products: fresh.products,
        total: fresh.total,
        hasMore: fresh.hasMore,
        fromCache: true,
      };
    }
  }

  const key = listQueryKey(userId, opts);
  const inflight = listInflight.get(key);
  if (inflight) return inflight;

  const task = fetchVeloProductsList(userId, opts).finally(() => {
    listInflight.delete(key);
  });
  listInflight.set(key, task);
  return task;
}

/** Warm cache in background (default list). Safe to call on page enter. */
export function prefetchVeloProductsList(
  userId: string,
  opts: {
    search?: string;
    draft?: "all" | "draft" | "published";
    page?: number;
    pageSize?: number;
  } = {}
) {
  const snap = peekVeloProductsList(userId, opts);
  if (snap && !snap.isStale) return;
  void listVeloProducts(userId, opts).catch(() => {
    /* background prefetch */
  });
}

export async function fetchVeloCollections(
  userId: string,
  forceRefresh = false
): Promise<VeloCollection[]> {
  if (!forceRefresh) {
    if (collectionsCache && Date.now() - collectionsCache.at < COLLECTIONS_CACHE_MS) {
      return collectionsCache.items;
    }
  }

  const integration = await getPrimaryIntegration(userId);
  const requestId = newRequestId();
  const res = await requestWithRetry(integration, "meta", requestId, {
    type: "collections",
  });
  const items = res.collections ?? [];
  collectionsCache = { at: Date.now(), items };
  writeCollectionsCache(userId, items);
  return items;
}

function normalizeBadge(badge: string) {
  return badge === "none" ? null : badge;
}

function normalizeSizeConfig(config: VeloSizeConfig) {
  if (!config.enabled) return undefined;
  return {
    enabled: true,
    options: config.options
      .map((o) => ({
        size: o.size.trim().toUpperCase().slice(0, 8),
        qty: Number(o.qty) || 0,
      }))
      .filter((o) => o.size || o.qty > 0),
  };
}

export type VeloProductUpsertInput = {
  productId?: string;
  veloExternalId?: string;
  name: string;
  description: string;
  collectionId: string;
  tags: string[];
  badge: string;
  rating: string;
  price: string;
  stock: number;
  isDraft: boolean;
  featuredImageMediaId?: string;
  imageBase64?: string;
  imageFileName?: string;
  sizeConfig: VeloSizeConfig;
};

type UpsertVeloProductOptions = {
  deferCacheInvalidation?: boolean;
};

export async function upsertVeloProduct(
  userId: string,
  data: VeloProductUpsertInput,
  options?: UpsertVeloProductOptions
) {
  const integration = await getPrimaryIntegration(userId);
  const requestId = newRequestId();
  const externalProductId = resolveExternalProductId({
    productId: data.productId,
    veloExternalId: data.veloExternalId,
  });
  const res = await requestWithRetry(integration, "upsert", requestId, {
    productId: data.productId,
    externalProductId,
    name: data.name.trim(),
    description: data.description,
    collectionId: data.collectionId,
    tags: data.tags,
    badge: normalizeBadge(data.badge),
    rating: data.rating || "4",
    price: data.price.trim(),
    stock: Math.max(0, Math.round(data.stock)),
    isDraft: normalizeIsDraft(data.isDraft),
    featuredImageMediaId: data.featuredImageMediaId?.trim() || undefined,
    imageBase64:
      data.imageBase64 && data.imageBase64 !== "[saved]"
        ? data.imageBase64
        : undefined,
    imageFileName:
      data.imageBase64 && data.imageBase64 !== "[saved]"
        ? data.imageFileName || undefined
        : undefined,
    sizeConfig: normalizeSizeConfig(data.sizeConfig),
  });
  if (res.product?.productId) {
    const collections = peekCollectionsCache(userId) ?? [];
    const collectionSlug =
      collections.find((c) => c.id === data.collectionId)?.slug ?? null;
    const apiSlug = (res.product as { slug?: string }).slug;
    await saveProductShopMeta(userId, {
      productId: res.product.productId,
      slug: apiSlug || slugifyProductName(data.name.trim()),
      collectionId: data.collectionId,
      collectionSlug,
      updatedAt: new Date().toISOString(),
    });
  }
  if (!options?.deferCacheInvalidation) {
    invalidateProductsListCache(userId);
  }
  return res;
}

/** Proactive compression + 413 retry — industry-standard reliable single upload. */
export async function uploadProductReliable(
  userId: string,
  data: VeloProductUpsertInput,
  opts?: {
    deferCacheInvalidation?: boolean;
    recompressImage?: (
      base64: string,
      fileName: string
    ) => Promise<{ base64: string; fileName: string }>;
  }
) {
  let imageBase64 = data.imageBase64;
  let imageFileName = data.imageFileName;

  const buildPayload = (): VeloProductUpsertInput => ({
    ...data,
    imageBase64,
    imageFileName,
  });

  if (
    opts?.recompressImage &&
    imageBase64 &&
    imageBase64 !== "[saved]" &&
    !isBase64WithinUploadLimit(imageBase64)
  ) {
    const smaller = await opts.recompressImage(imageBase64, imageFileName || "product.webp");
    imageBase64 = smaller.base64;
    imageFileName = smaller.fileName;
  }

  try {
    return await upsertVeloProduct(userId, buildPayload(), {
      deferCacheInvalidation: opts?.deferCacheInvalidation,
    });
  } catch (firstError) {
    const msg = (firstError as Error).message;
    if (
      opts?.recompressImage &&
      imageBase64 &&
      imageBase64 !== "[saved]" &&
      isPayloadTooLargeMessage(msg)
    ) {
      const smaller = await opts.recompressImage(imageBase64, imageFileName || "product.webp");
      imageBase64 = smaller.base64;
      imageFileName = smaller.fileName;
      return await upsertVeloProduct(userId, buildPayload(), {
        deferCacheInvalidation: opts?.deferCacheInvalidation,
      });
    }
    throw firstError;
  }
}

export async function bulkUpsertVeloProducts(
  userId: string,
  data: {
    namePrefix: string;
    description: string;
    collectionId: string;
    tags: string[];
    badge: string;
    rating: string;
    price: string;
    stock: number;
    isDraft: boolean;
    sizeConfig: VeloSizeConfig;
    items: { imageBase64: string; imageFileName: string; name?: string }[];
    itemIndexOffset?: number;
  }
) {
  const integration = await getPrimaryIntegration(userId);
  const requestId = newRequestId();
  const offset = data.itemIndexOffset ?? 0;
  return requestWithRetry(integration, "bulk_upsert", requestId, {
    shared: {
      namePrefix: data.namePrefix.trim(),
      description: data.description,
      collectionId: data.collectionId,
      tags: data.tags,
      badge: normalizeBadge(data.badge),
      rating: data.rating || "4",
      price: data.price.trim(),
      stock: Math.max(0, Math.round(data.stock)),
      isDraft: normalizeIsDraft(data.isDraft),
      sizeConfig: normalizeSizeConfig(data.sizeConfig),
    },
    items: data.items.map((item, index) => ({
      externalProductId: newVeloExternalId(`${requestId.slice(0, 8)}-${offset + index}`),
      imageBase64: item.imageBase64,
      imageFileName: item.imageFileName,
      name: item.name,
    })),
  }).then((res) => {
    invalidateProductsListCache(userId);
    return res;
  });
}

export type BulkUploadProgress = {
  current: number;
  total: number;
  percent: number;
  label: string;
};

/** Upload bulk images one-by-one (reliable upsert per product, WebP-compressed). */
export async function uploadBulkProductsSequential(
  userId: string,
  data: {
    namePrefix: string;
    description: string;
    collectionId: string;
    tags: string[];
    badge: string;
    rating: string;
    price: string;
    stock: number;
    isDraft: boolean;
    sizeConfig: VeloSizeConfig;
    images: { imageBase64: string; imageFileName: string }[];
    onProgress?: (progress: BulkUploadProgress) => void;
    recompressImage?: (
      base64: string,
      fileName: string
    ) => Promise<{ base64: string; fileName: string }>;
  }
) {
  const { images, onProgress, recompressImage, ...shared } = data;
  let totalCreated = 0;
  const createdCodes: string[] = [];
  const warnings: string[] = [];
  const failures: string[] = [];

  for (let i = 0; i < images.length; i++) {
    const current = i + 1;
    const productName = `${shared.namePrefix.trim()} ${current}`;
    onProgress?.({
      current,
      total: images.length,
      percent: Math.round(5 + ((current - 0.5) / images.length) * 90),
      label: `Uploading product ${current}/${images.length}`,
    });

    try {
      const res = await uploadProductReliable(
        userId,
        {
          name: productName,
          description: shared.description,
          collectionId: shared.collectionId,
          tags: shared.tags,
          badge: shared.badge,
          rating: shared.rating,
          price: shared.price,
          stock: shared.stock,
          isDraft: shared.isDraft,
          sizeConfig: shared.sizeConfig,
          imageBase64: images[i].imageBase64,
          imageFileName: images[i].imageFileName,
        },
        {
          deferCacheInvalidation: true,
          recompressImage,
        }
      );

      if (res.product?.productId) {
        totalCreated += 1;
        if (res.product.productCode) createdCodes.push(res.product.productCode);
      } else if (res.ok) {
        totalCreated += 1;
      }
    } catch (e) {
      failures.push(`${productName}: ${(e as Error).message}`);
    }
  }

  invalidateProductsListCache(userId);

  if (totalCreated === 0 && failures.length > 0) {
    throw new VeloProductsApiError(failures[0] ?? "Bulk upload failed.");
  }

  return { totalCreated, createdCodes, warnings, failures };
}

export function formatBulkCreatedCodes(
  created: VeloProductsResponse["created"]
): string[] {
  if (!created?.length) return [];
  return created
    .map((row) => {
      const entry = row as {
        product?: { productCode?: string | null };
        productCode?: string | null;
      };
      return entry.product?.productCode ?? entry.productCode ?? null;
    })
    .filter((code): code is string => Boolean(code));
}

export async function deleteVeloProduct(userId: string, productId: string) {
  const integration = await getPrimaryIntegration(userId);
  const requestId = newRequestId();
  const res = await requestWithRetry(integration, "delete", requestId, { productId });
  invalidateProductsListCache(userId);
  return res;
}

export function validateSingleProductForm(data: {
  name: string;
  collectionId: string;
  price: string;
  stock: number;
  imageBase64: string;
  featuredImageMediaId: string;
  productId?: string;
  sizeConfig: VeloSizeConfig;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!data.name.trim()) errors.name = "Name is required.";
  if (!data.collectionId) errors.collectionId = "Collection is required.";
  if (!data.price.trim() || Number.isNaN(Number(data.price))) errors.price = "Valid price is required.";
  if (data.stock < 0) errors.stock = "Stock cannot be negative.";
  if (
    !data.productId &&
    !hasUsableProductImage(data.imageBase64, data.featuredImageMediaId)
  ) {
    errors.image = "Product image is required.";
  }
  if (data.sizeConfig.enabled) {
    const valid = data.sizeConfig.options.some((o) => o.size.trim() && o.qty >= 0);
    if (!valid) errors.sizeConfig = "Add at least one size row.";
  }
  return errors;
}

export function validateBulkForm(data: {
  namePrefix: string;
  collectionId: string;
  price: string;
  stock: number;
  imageCount: number;
  sizeConfig: VeloSizeConfig;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!data.namePrefix.trim()) errors.namePrefix = "Name prefix is required.";
  if (!data.collectionId) errors.collectionId = "Collection is required.";
  if (!data.price.trim() || Number.isNaN(Number(data.price))) errors.price = "Valid price is required.";
  if (data.stock < 0) errors.stock = "Stock cannot be negative.";
  if (data.imageCount === 0) errors.images = "Select at least one image.";
  if (data.sizeConfig.enabled) {
    const valid = data.sizeConfig.options.some((o) => o.size.trim());
    if (!valid) errors.sizeConfig = "Add at least one size row.";
  }
  return errors;
}
