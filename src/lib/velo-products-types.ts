export type VeloProductBadge = "new_product" | "best_sale" | "featured" | "none";

export type VeloSizeOption = {
  size: string;
  qty: number;
};

export type VeloSizeConfig = {
  enabled: boolean;
  options: VeloSizeOption[];
};

export type VeloCollection = {
  id: string;
  label: string;
  slug: string;
  description?: string | null;
  featuredImageId?: string | null;
  imageUrl?: string | null;
};

export type VeloProductListItem = {
  productId: string;
  /** Shop-assigned ST code (e.g. ST000042). */
  productCode: string | null;
  /** Internal Velo mapping id (hidden from staff). */
  externalProductId?: string | null;
  name: string;
  collectionId: string | null;
  collectionName: string | null;
  /** Shop URL slug (from upload meta or list API). */
  slug?: string | null;
  collectionSlug?: string | null;
  price: string;
  stock: number | null;
  isDraft: boolean;
  updatedAt: string;
  /** Featured product photo (public URL) when shop returns it. */
  imageUrl?: string | null;
};

export type VeloProductsAction =
  | "list"
  | "upsert"
  | "bulk_upsert"
  | "delete"
  | "meta"
  | "resolveImages"
  | "upsertCollection"
  | "deleteCollection";

export type VeloProductsResponse = {
  ok: boolean;
  requestId: string;
  action: VeloProductsAction;
  message?: string;
  errors?: string[];
  products?: VeloProductListItem[];
  product?: {
    productId: string;
    productCode: string | null;
    name: string;
    isDraft: boolean;
  };
  collection?: VeloCollection;
  collections?: VeloCollection[];
  deletedId?: string;
  deletedIds?: string[];
  archivedIds?: string[];
  blocked?: Array<{ id: string; reason: string }>;
  remaining?: number;
  done?: boolean;
  collectionDeleted?: boolean;
  created?: Array<
    | { id: string; productCode: string; name: string; slug: string }
    | {
        index: number;
        externalProductId: string;
        created: boolean;
        product: {
          productId: string;
          productCode: string | null;
          slug: string;
          name: string;
          isDraft: boolean;
        };
      }
  >;
  createdCount?: number;
  updatedCount?: number;
  warnings?: string[];
  page?: number;
  pageSize?: number;
  total?: number;
  hasMore?: boolean;
};

export type VeloSingleProductForm = {
  productId?: string;
  /** Read-only shop code (ST…) when editing. */
  websiteProductCode?: string;
  /** Internal id for API upsert; auto-generated on create. */
  veloExternalId: string;
  name: string;
  description: string;
  collectionId: string;
  tags: string[];
  badge: VeloProductBadge;
  rating: string;
  price: string;
  stock: number;
  isDraft: boolean;
  featuredImageMediaId: string;
  imageBase64: string;
  imageFileName: string;
  sizeConfig: VeloSizeConfig;
};

export type VeloBulkSharedForm = {
  namePrefix: string;
  description: string;
  collectionId: string;
  tags: string[];
  badge: VeloProductBadge;
  rating: string;
  price: string;
  stock: number;
  isDraft: boolean;
  sizeConfig: VeloSizeConfig;
};

export const DEFAULT_SIZE_OPTIONS: VeloSizeOption[] = [
  { size: "36", qty: 1 },
  { size: "38", qty: 1 },
  { size: "40", qty: 1 },
  { size: "42", qty: 1 },
  { size: "44", qty: 1 },
];

export const EMPTY_SINGLE_FORM: VeloSingleProductForm = {
  veloExternalId: "",
  name: "",
  description: "",
  collectionId: "",
  tags: [],
  badge: "none",
  rating: "4",
  price: "",
  stock: 1,
  isDraft: false,
  featuredImageMediaId: "",
  imageBase64: "",
  imageFileName: "",
  sizeConfig: { enabled: false, options: [...DEFAULT_SIZE_OPTIONS] },
};

export const EMPTY_BULK_FORM: VeloBulkSharedForm = {
  namePrefix: "",
  description: "",
  collectionId: "",
  tags: [],
  badge: "none",
  rating: "4",
  price: "",
  stock: 1,
  isDraft: false,
  sizeConfig: { enabled: false, options: [...DEFAULT_SIZE_OPTIONS] },
};
