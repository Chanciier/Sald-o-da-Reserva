export type ProductStatus = 'ACTIVE' | 'INACTIVE' | 'OUT_OF_STOCK';

export interface ProductImage {
  id: string;
  url: string;
  key: string;
  width: number | null;
  height: number | null;
  size: number;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { products: number };
}

export interface Dimensions {
  width: number;
  height: number;
  depth: number;
  unit: string;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  sku: string;
  brand: string | null;
  shortDescription: string | null;
  description: string | null;
  price: number;
  salePrice: number | null;
  weight: number | null;
  dimensions: Dimensions | null;
  stock: number;
  status: ProductStatus;
  categoryId: string | null;
  category: Category | null;
  images: ProductImage[];
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ProductQuery {
  page?: number;
  limit?: number;
  search?: string;
  categoryId?: string;
  categorySlug?: string;
  status?: ProductStatus;
  minPrice?: number;
  maxPrice?: number;
  brand?: string;
  inStock?: boolean;
  sortBy?: 'price' | 'name' | 'createdAt' | 'stock';
  sortOrder?: 'asc' | 'desc';
}
