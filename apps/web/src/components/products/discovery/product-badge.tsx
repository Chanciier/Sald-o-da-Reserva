import { Flame, Zap, Eye, Hourglass } from 'lucide-react';
import { cn } from '@/lib/utils';
import { badgeLabels, type Badge } from '@/lib/discovery';

const config: Record<Badge, { icon: React.ElementType; className: string }> = {
  novo: {
    icon: Flame,
    className: 'bg-accent text-accent-foreground',
  },
  oferta: {
    icon: Zap,
    className: 'bg-primary text-primary-foreground',
  },
  ultimas: {
    icon: Hourglass,
    className: 'bg-accent text-accent-foreground',
  },
  visualizado: {
    icon: Eye,
    className: 'bg-foreground text-background',
  },
};

export function ProductBadge({ type, className }: { type: Badge; className?: string }) {
  const { icon: Icon, className: variant } = config[type];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide shadow-sm',
        variant,
        className,
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {badgeLabels[type]}
    </span>
  );
}
