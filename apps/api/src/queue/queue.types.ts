/**
 * Nomes canônicos das filas do OMS. Centralizados para evitar strings soltas
 * espalhadas pelos módulos.
 */
export const QueueNames = {
  MarketplacePublish: 'marketplace.publish',
  MarketplaceSync: 'marketplace.sync',
  WebhookProcess: 'webhook.process',
} as const;

export type QueueName = (typeof QueueNames)[keyof typeof QueueNames];

export interface QueueJob<T = unknown> {
  id: string;
  name: string;
  data: T;
  attempts: number;
  enqueuedAt: number;
}

export type JobHandler<T = unknown> = (data: T) => Promise<void> | void;

export interface QueueHandlerOptions {
  /** Tentativas totais antes de mandar para a dead-letter. Padrão: 5. */
  maxAttempts?: number;
}
