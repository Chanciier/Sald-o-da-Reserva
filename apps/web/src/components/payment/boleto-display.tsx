'use client';

import { useState } from 'react';
import type { Payment } from '@/types/payment';

interface BoletoDisplayProps {
  payment: Payment;
}

function formatBoletoCode(code: string): string {
  return code.replace(
    /(.{5})(.{5})(.{5})(.{6})(.{5})(.{6})(.{1})(.{14})/,
    '$1.$2 $3.$4 $5.$6 $7 $8',
  );
}

export function BoletoDisplay({ payment }: BoletoDisplayProps) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    if (!payment.boletoCode) return;
    await navigator.clipboard.writeText(payment.boletoCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  const expiresDate = payment.boletoExpiresAt
    ? new Date(payment.boletoExpiresAt).toLocaleDateString('pt-BR')
    : null;

  return (
    <div className="flex flex-col gap-6 py-4">
      <div className="text-center">
        <p className="text-sm text-muted-foreground">Pague o boleto até a data de vencimento</p>
        {expiresDate && (
          <p className="mt-1 text-xs text-orange-500 font-medium">Vence em: {expiresDate}</p>
        )}
      </div>

      {payment.boletoCode && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-center text-muted-foreground uppercase tracking-wide">
            Linha digitável
          </p>
          <div className="rounded-xl border border-border bg-muted p-4 text-center font-mono text-sm break-all">
            {formatBoletoCode(payment.boletoCode)}
          </div>
          <button
            type="button"
            onClick={copyCode}
            className="w-full rounded-lg border border-border py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            {copied ? '✓ Código copiado' : 'Copiar código de barras'}
          </button>
        </div>
      )}

      {payment.boletoUrl && (
        <a
          href={payment.boletoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          Visualizar / Imprimir boleto
        </a>
      )}

      <div className="rounded-xl bg-muted/60 p-4 text-sm text-muted-foreground space-y-1.5">
        <p className="font-medium text-foreground">Como pagar:</p>
        <ul className="list-disc list-inside space-y-1 text-xs">
          <li>Internet banking ou app do seu banco</li>
          <li>Lotérica ou agência bancária</li>
          <li>Caixas eletrônicos</li>
        </ul>
        <p className="text-xs pt-1">
          O pedido será confirmado em até 2 dias úteis após o pagamento.
        </p>
      </div>
    </div>
  );
}
