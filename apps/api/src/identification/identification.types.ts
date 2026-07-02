import { VisionAttributes } from '../vision/vision.types';

/**
 * Entrada do IdentificationModule: os atributos brutos que o VisionModule já
 * extraiu das fotos (marca, modelo, cor, material, dimensões, estado,
 * características, palavras-chave). Todos opcionais — o Vision pode não ter
 * determinado algum deles.
 */
export type IdentificationInput = Partial<VisionAttributes>;

/** Um par atributo/valor de ficha técnica (ex.: { label: "Cor", value: "Preto" }). */
export interface ProductSpecification {
  label: string;
  value: string;
}

/**
 * Conteúdo comercial gerado a partir dos atributos do Vision. Tudo aqui é
 * pensado para ser exibido num painel de revisão editável antes de virar um
 * Product de verdade — nada é persistido por este módulo.
 */
export interface IdentificationResult {
  /** Título comercial/SEO (mapeia para `Product.name`). */
  seoTitle: string;
  /** Descrição completa (mapeia para `Product.description`). */
  description: string;
  /** Ficha técnica estruturada. Sem campo correspondente no schema hoje. */
  specifications: ProductSpecification[];
  /** Nome da categoria sugerida pela IA, em texto livre. */
  category: string | null;
  /** Id de uma `Category` já cadastrada, se houve correspondência. */
  categoryId: string | null;
  /** Palavras-chave de busca. Sem campo correspondente no schema hoje. */
  tags: string[];
  /** Slug sugerido a partir do título (mapeia para `Product.slug`). */
  slug: string;
  /** Meta description para SEO (mapeia para `Product.metaDescription`). */
  metaDescription: string;
  /** Modelo Ollama efetivamente usado. */
  modelUsed: string;
}
