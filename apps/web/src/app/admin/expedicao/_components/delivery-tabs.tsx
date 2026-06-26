'use client';

import { Truck, Store } from 'lucide-react';

const TABS = [
  { value: 'SHIPPING', label: 'Envio', icon: Truck },
  { value: 'PICKUP', label: 'Retirada', icon: Store },
] as const;

/**
 * Controle segmentado para separar os fluxos de Envio e Retirada nas listas de
 * expedição. Mostra um tipo por vez (a visão consolidada fica no dashboard).
 */
export function DeliveryTabs({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border bg-card p-1">
      {TABS.map((t) => {
        const active = value === t.value;
        const Icon = t.icon;
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => onChange(t.value)}
            className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-4 w-4" />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
