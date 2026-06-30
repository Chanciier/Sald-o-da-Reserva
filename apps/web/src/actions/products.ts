const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export interface ProductImage {
  id: string;
  url: string;
  key: string;
  position: number;
  width?: number | null;
  height?: number | null;
}

export interface ProductCategory {
  id: string;
  name: string;
  slug: string;
}

export interface ProductCreatedBy {
  id: string;
  name: string | null;
  email: string;
}

export interface ProductPublication {
  marketplace: string;
  status: string;
  externalId: string | null;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  sku: string;
  internalCode: string | null;
  brand: string | null;
  shortDescription: string | null;
  description: string | null;
  price: number;
  salePrice: number | null;
  weight: number | null;
  dimensions: { width: number; height: number; depth: number; unit: string } | null;
  stock: number;
  minimumStock: number;
  pickupAvailable: boolean;
  featuredOffer: boolean;
  status: string;
  metaTitle: string | null;
  metaDescription: string | null;
  ncm: string | null;
  origem: number | null;
  cfop: string | null;
  cstCsosn: string | null;
  gtin: string | null;
  condition: string;
  autoPublishWhatsapp: boolean;
  whatsappGroupIds: string[];
  isUnique: boolean;
  categoryId: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  category: ProductCategory | null;
  images: ProductImage[];
  createdBy: ProductCreatedBy | null;
  publications?: ProductPublication[];
}

export interface ProductsResponse {
  data: Product[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  ncm?: string | null;
}

export async function fetchProducts(
  token: string | null,
  params?: Record<string, string>,
): Promise<ProductsResponse> {
  const url = new URL(`${BASE}/api/v1/products`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v) url.searchParams.set(k, v);
    });
  }
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url.toString(), { headers, cache: 'no-store' });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message ?? 'Erro ao buscar produtos');
  return json;
}

export async function fetchProduct(token: string, id: string): Promise<Product> {
  const res = await fetch(`${BASE}/api/v1/products/id/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message ?? 'Produto não encontrado');
  return json;
}

export async function createProduct(
  token: string,
  data: Record<string, unknown>,
): Promise<Product> {
  const res = await fetch(`${BASE}/api/v1/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
    cache: 'no-store',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message ?? 'Erro ao criar produto');
  return json;
}

export async function updateProduct(
  token: string,
  id: string,
  data: Record<string, unknown>,
): Promise<Product> {
  const res = await fetch(`${BASE}/api/v1/products/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
    cache: 'no-store',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message ?? 'Erro ao atualizar produto');
  return json;
}

export async function deleteProduct(token: string, id: string): Promise<{ archived: boolean }> {
  const res = await fetch(`${BASE}/api/v1/products/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok && res.status !== 204) {
    const json = await res.json().catch(() => ({}));
    throw new Error((json as { message?: string }).message ?? 'Erro ao excluir produto');
  }
  const json = await res.json().catch(() => ({ archived: false }));
  return json as { archived: boolean };
}

export async function fetchCategories(): Promise<{ data: CategoryItem[] }> {
  try {
    const res = await fetch(`${BASE}/api/v1/categories`, { cache: 'no-store' });
    if (!res.ok) return { data: [] };
    return res.json();
  } catch {
    return { data: [] };
  }
}
