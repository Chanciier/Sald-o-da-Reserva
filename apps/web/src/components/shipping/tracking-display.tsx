'use client';

import type { Shipment, ShipmentStatus } from '@/types/order';

interface TrackingDisplayProps {
  shipment: Shipment;
}

const STATUS_MAP: Record<ShipmentStatus, { label: string; color: string }> = {
  PENDING: { label: 'Aguardando envio', color: 'text-yellow-600 dark:text-yellow-400' },
  LABEL_PURCHASED: { label: 'Etiqueta gerada', color: 'text-blue-600 dark:text-blue-400' },
  SHIPPED: { label: 'Enviado', color: 'text-purple-600 dark:text-purple-400' },
  IN_TRANSIT: { label: 'Em trânsito', color: 'text-indigo-600 dark:text-indigo-400' },
  DELIVERED: { label: 'Entregue', color: 'text-green-600 dark:text-green-400' },
  CANCELLED: { label: 'Cancelado', color: 'text-red-600 dark:text-red-400' },
};

const STATUS_STEPS: ShipmentStatus[] = [
  'PENDING',
  'LABEL_PURCHASED',
  'SHIPPED',
  'IN_TRANSIT',
  'DELIVERED',
];

function stepIndex(status: ShipmentStatus) {
  const i = STATUS_STEPS.indexOf(status);
  return i === -1 ? 0 : i;
}

export function TrackingDisplay({ shipment }: TrackingDisplayProps) {
  const current = STATUS_MAP[shipment.status] ?? STATUS_MAP.PENDING;
  const currentStep = stepIndex(shipment.status);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            {shipment.carrier} · {shipment.service}
          </p>
          {shipment.trackingCode && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Código:{' '}
              <span className="font-mono font-medium text-foreground">{shipment.trackingCode}</span>
            </p>
          )}
        </div>
        <span className={`text-sm font-semibold ${current.color}`}>{current.label}</span>
      </div>

      {/* Progress stepper */}
      {shipment.status !== 'CANCELLED' && (
        <div className="relative flex items-center justify-between">
          <div className="absolute inset-x-0 top-3 h-0.5 bg-border" />
          <div
            className="absolute top-3 h-0.5 bg-primary transition-all duration-500"
            style={{ width: `${(currentStep / (STATUS_STEPS.length - 1)) * 100}%` }}
          />
          {STATUS_STEPS.map((step, i) => {
            const done = i <= currentStep;
            return (
              <div key={step} className="relative flex flex-col items-center gap-1.5 z-10">
                <div
                  className={`h-6 w-6 rounded-full border-2 flex items-center justify-center text-xs transition-colors ${
                    done
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-muted-foreground'
                  }`}
                >
                  {done ? (
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={3}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  ) : (
                    <span>{i + 1}</span>
                  )}
                </div>
                <span
                  className={`text-[10px] text-center leading-tight max-w-[60px] ${
                    done ? 'text-foreground font-medium' : 'text-muted-foreground'
                  }`}
                >
                  {STATUS_MAP[step].label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Delivery estimate */}
      {shipment.status === 'PENDING' && shipment.deliveryMin && shipment.deliveryMax && (
        <p className="text-xs text-muted-foreground text-center">
          Previsão: {shipment.deliveryMin}–{shipment.deliveryMax} dias úteis após postagem
        </p>
      )}

      {/* Label URL */}
      {shipment.labelUrl && (
        <a
          href={shipment.labelUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-primary hover:underline"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          Baixar etiqueta (PDF)
        </a>
      )}

      {/* Timeline */}
      {(shipment.events?.length ?? 0) > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Histórico</p>
          <ol className="relative border-l border-border ml-3 space-y-3">
            {(shipment.events ?? []).map((ev) => (
              <li key={ev.id} className="pl-4">
                <div className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full border border-border bg-background" />
                <p className="text-sm font-medium leading-tight">{ev.description ?? ev.event}</p>
                {ev.location && <p className="text-xs text-muted-foreground">{ev.location}</p>}
                <time className="text-xs text-muted-foreground">
                  {new Date(ev.createdAt).toLocaleString('pt-BR')}
                </time>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
