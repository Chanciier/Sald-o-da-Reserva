// Espelha apps/api/src/vision/vision.types.ts e apps/api/src/identification/identification.types.ts
// (os dois apps não compartilham pacote de tipos — mesma convenção já usada em products.ts/product.ts)

export type VisionCondition = 'NOVO' | 'USADO_BOM' | 'USADO_REGULAR' | 'DANIFICADO';

export interface VisionResult {
  brand: string | null;
  model: string | null;
  category: string | null;
  color: string | null;
  material: string | null;
  dimensions: string | null;
  condition: VisionCondition | null;
  features: string[];
  keywords: string[];
  confidence: number;
  modelUsed: string;
  imagesAnalyzed: number;
}

export interface ProductSpecification {
  label: string;
  value: string;
}

export interface IdentificationResult {
  seoTitle: string;
  description: string;
  specifications: ProductSpecification[];
  category: string | null;
  categoryId: string | null;
  tags: string[];
  slug: string;
  metaDescription: string;
  modelUsed: string;
}
