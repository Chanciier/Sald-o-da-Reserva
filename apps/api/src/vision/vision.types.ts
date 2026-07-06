/**
 * Contrato de saída do VisionModule.
 *
 * O modelo de visão (Qwen2.5-VL via Ollama) extrai atributos visuais brutos de
 * 1..N fotos de um produto. Este módulo NÃO faz pesquisa de mercado nem sugere
 * preço — só descreve o que vê. Os campos mapeiam 1:1 com o que será usado
 * depois pelos módulos de Identificação/Descrição/NCM do Funcionário Virtual.
 */

/** Grau de conservação, na mesma convenção já usada pelo protótipo Gemini. */
export type VisionCondition = 'NOVO' | 'USADO_BOM' | 'USADO_REGULAR' | 'DANIFICADO';

export const VISION_CONDITIONS: readonly VisionCondition[] = [
  'NOVO',
  'USADO_BOM',
  'USADO_REGULAR',
  'DANIFICADO',
];

/** Atributos visuais extraídos. `null` = o modelo não conseguiu determinar. */
export interface VisionAttributes {
  /** Marca / fabricante (ex.: "Mondial"). */
  brand: string | null;
  /** Modelo / linha (ex.: "Air Fryer AF-31"). */
  model: string | null;
  /** Categoria em linguagem natural (ex.: "Fritadeira elétrica"). */
  category: string | null;
  /** Cor predominante (ex.: "preto"). */
  color: string | null;
  /** Material predominante (ex.: "plástico e inox"). */
  material: string | null;
  /**
   * Dimensões visíveis/estimadas como texto livre (ex.: "30 x 20 x 15 cm" ou
   * "5 litros"). String porque é sempre leitura/estimativa da foto, não medida.
   */
  dimensions: string | null;
  /**
   * Estimativa estruturada da embalagem para frete (cm). `null` quando o
   * modelo não tem base para estimar. Sempre revisável pelo operador.
   */
  estimatedDimensionsCm: { width: number; height: number; depth: number } | null;
  /** Peso estimado em kg (para frete). `null` quando não estimável. */
  estimatedWeightKg: number | null;
  /** GTIN/EAN lido de código de barras/etiqueta visível na foto, ou `null`. */
  gtin: string | null;
  /** Estado de conservação. */
  condition: VisionCondition | null;
  /** Características observáveis (ex.: ["display digital", "cesto removível"]). */
  features: string[];
  /** Palavras-chave para busca (ex.: ["air fryer", "fritadeira", "mondial"]). */
  keywords: string[];
  /** Índice de confiança agregado do modelo, 0..1. */
  confidence: number;
}

/** Resultado completo da análise, incluindo metadados da execução. */
export interface VisionResult extends VisionAttributes {
  /** Modelo Ollama efetivamente usado (ex.: "qwen2.5vl"). */
  modelUsed: string;
  /** Quantidade de imagens enviadas ao modelo nesta análise. */
  imagesAnalyzed: number;
}

/** Entrada normalizada para o serviço: imagens já em base64 (sem prefixo data:). */
export interface VisionAnalyzeInput {
  imageUrls?: string[];
  imagesBase64?: string[];
}
