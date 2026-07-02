/**
 * Contrato do LearningModule — fecha o ciclo do Funcionário Virtual. Observa o
 * que acontece DEPOIS do preço ser aplicado (venda rápida, estoque parado,
 * muitos acessos) e aprende um "viés" por categoria que desloca as próximas
 * sugestões do PricingModule (`PricingInput.learningBias`).
 *
 * Aprendizado aqui é deliberadamente simples e explicável — um acumulador
 * clampado, não um modelo estatístico — para que cada ajuste seja rastreável
 * até um evento real (`LearningEvent`), igual ao PricingModule é explicável
 * até um fator.
 */

export type LearningEventType = 'FAST_SALE' | 'SLOW_SALE' | 'STAGNANT' | 'HIGH_TRAFFIC';

/** Um evento de aprendizado registrado (alimenta o dashboard e o viés da categoria). */
export interface LearningEvent {
  type: LearningEventType;
  productId: string;
  categoryId: string | null;
  /** Ex.: "vendeu em 6h — sugerir preço maior da próxima vez." */
  detail: string;
  /** Quanto esse evento moveu o viés da categoria (-1..1). */
  biasDelta: number;
  createdAt: string;
}

/** Viés acumulado de uma categoria — o que o PricingModule consome. */
export interface CategoryBias {
  categoryId: string;
  categoryName: string | null;
  /** -1 (empurra preços para baixo) .. +1 (empurra para cima). */
  bias: number;
  /** Quantos eventos contribuíram para esse viés. */
  eventCount: number;
  updatedAt: string;
}

/** Dados agregados para o painel administrativo. */
export interface LearningDashboard {
  totals: Record<LearningEventType, number>;
  categoryBias: CategoryBias[];
  recentEvents: LearningEvent[];
}

export interface TrackViewResult {
  productId: string;
  viewsToday: number;
  highTrafficTriggered: boolean;
}
