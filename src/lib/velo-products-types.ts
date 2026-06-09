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
};

export type VeloProductListItem = {
  productId: string;
  productCode: string | null;
  name: string;
  collectionId: string | null;
  collectionName: string | null;
  price: string;
  stock: number | null;
  isDraft: boolean;
  updatedAt: string;
};

export type VeloProductsAction =
  | "list"
  | "upsert"
  | "bulk_upsert"
  | "delete"
  | "meta";

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
  collections?: VeloCollection[];
  created?: { id: string; productCode: string; name: string; slug: string }[];
  createdCount?: number;
  warnings?: string[];
  page?: number;
  pageSize?: number;
  total?: number;
  hasMore?: boolean;
};

export type VeloSingleProductForm = {
  productId?: string;
  externalProductId: string;
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
  externalProductId: "",
  name: "",
  description: "",
  collectionId: "",
  tags: [],
  badge: "none",
  rating: "4",
  price: "",
  stock: 1,
  isDraft: true,
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
  isDraft: true,
  sizeConfig: { enabled: false, options: [...DEFAULT_SIZE_OPTIONS] },
};
