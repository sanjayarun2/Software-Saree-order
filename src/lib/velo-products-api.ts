import {
  getEnabledApiIntegrations,
  type ApiIntegrationRow,
} from "./api-settings-supabase";
import { appendProductSyncLog } from "./product-sync-logs";
import { supabase } from "./supabase";
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

function isRetryable(status: number, message: string) {
  if (status >= 500) return true;
  return /network|timeout|failed to fetch|load failed|temporarily/i.test(message);
}

function newRequestId() {
  return crypto.randomUUID();
}

async function getPrimaryIntegration(userId: string): Promise<ApiIntegrationRow> {
  const rows = await getEnabledApiIntegrations(userId);
  const withKey = rows.filter((r) => r.api_key.trim().length > 0);
  if (withKey.length === 0) {
    throw new VeloProductsApiError(
      "No API key configured. Add your Velo API key in Settings → API Settings."
    );
  }
  return withKey[0];
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

    if (error) {
      if (/function not found|404|not deployed/i.test(error.message)) {
        throw new VeloProductsApiError(
          "Products API proxy not deployed. Deploy velo-website-products in Supabase."
        );
      }
      throw new VeloProductsApiError(error.message);
    }

    if (!payload || typeof payload !== "object") {
      throw new VeloProductsApiError("Empty response from server.");
    }

    const res = payload as VeloProductsResponse;
    if ("error" in payload && payload.error && !res.ok) {
      throw new VeloProductsApiError(String(payload.error));
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

export async function listVeloProducts(
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
  return {
    products: res.products ?? [],
    total: res.total ?? 0,
    hasMore: res.hasMore ?? false,
  };
}

export async function fetchVeloCollections(
  userId: string,
  forceRefresh = false
): Promise<VeloCollection[]> {
  if (
    !forceRefresh &&
    collectionsCache &&
    Date.now() - collectionsCache.at < COLLECTIONS_CACHE_MS
  ) {
    return collectionsCache.items;
  }

  const integration = await getPrimaryIntegration(userId);
  const requestId = newRequestId();
  const res = await requestWithRetry(integration, "meta", requestId, {
    type: "collections",
  });
  const items = res.collections ?? [];
  collectionsCache = { at: Date.now(), items };
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

export async function upsertVeloProduct(
  userId: string,
  data: {
    productId?: string;
    externalProductId: string;
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
  }
) {
  const integration = await getPrimaryIntegration(userId);
  const requestId = newRequestId();
  return requestWithRetry(integration, "upsert", requestId, {
    productId: data.productId,
    externalProductId: data.externalProductId.trim(),
    name: data.name.trim(),
    description: data.description,
    collectionId: data.collectionId,
    tags: data.tags,
    badge: normalizeBadge(data.badge),
    rating: data.rating || "4",
    price: data.price.trim(),
    stock: Math.max(0, Math.round(data.stock)),
    isDraft: data.isDraft,
    featuredImageMediaId: data.featuredImageMediaId?.trim() || undefined,
    imageBase64: data.imageBase64 || undefined,
    imageFileName: data.imageFileName || undefined,
    sizeConfig: normalizeSizeConfig(data.sizeConfig),
  });
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
    items: { imageBase64: string; imageFileName: string; externalProductId?: string; name?: string }[];
  }
) {
  const integration = await getPrimaryIntegration(userId);
  const requestId = newRequestId();
  return requestWithRetry(integration, "bulk_upsert", requestId, {
    namePrefix: data.namePrefix.trim(),
    description: data.description,
    collectionId: data.collectionId,
    tags: data.tags,
    badge: normalizeBadge(data.badge),
    rating: data.rating || "4",
    price: data.price.trim(),
    stock: Math.max(0, Math.round(data.stock)),
    isDraft: data.isDraft,
    sizeConfig: normalizeSizeConfig(data.sizeConfig),
    items: data.items,
  });
}

export async function deleteVeloProduct(userId: string, productId: string) {
  const integration = await getPrimaryIntegration(userId);
  const requestId = newRequestId();
  return requestWithRetry(integration, "delete", requestId, { productId });
}

export function validateSingleProductForm(data: {
  externalProductId: string;
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
  if (!data.externalProductId.trim()) errors.externalProductId = "Product code is required.";
  if (!data.name.trim()) errors.name = "Name is required.";
  if (!data.collectionId) errors.collectionId = "Collection is required.";
  if (!data.price.trim() || Number.isNaN(Number(data.price))) errors.price = "Valid price is required.";
  if (data.stock < 0) errors.stock = "Stock cannot be negative.";
  if (!data.productId && !data.imageBase64 && !data.featuredImageMediaId.trim()) {
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
