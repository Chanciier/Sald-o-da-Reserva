import type { OrderChannel } from '@/actions/expedicao';

const CONFIG: Record<OrderChannel, { label: string; className: string }> = {
  SITE: {
    label: 'Site',
    className: 'bg-muted text-muted-foreground',
  },
  MERCADO_LIVRE: {
    label: 'Mercado Livre',
    className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  },
  SHOPEE: {
    label: 'Shopee',
    className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  },
};

/**
 * Marca visualmente o canal de origem do pedido na expedição. O canal SITE só
 * aparece quando `showSite` é true (na maioria das listas, omitir reduz ruído).
 */
export function ChannelBadge({
  channel,
  showSite = false,
}: {
  channel: OrderChannel;
  showSite?: boolean;
}) {
  if (channel === 'SITE' && !showSite) return null;
  const cfg = CONFIG[channel] ?? CONFIG.SITE;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cfg.className}`}
    >
      {cfg.label}
    </span>
  );
}
