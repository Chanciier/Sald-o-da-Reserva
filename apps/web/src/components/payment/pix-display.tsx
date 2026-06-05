'use client';

import { useEffect, useState } from 'react';
import type { Payment } from '@/types/payment';

interface PixDisplayProps {
  payment: Payment;
}

function formatCountdown(expiresAt: string): string {
  const diff = Math.max(0, new Date(expiresAt).getTime() - Date.now());
  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function PixDisplay({ payment }: PixDisplayProps) {
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState('');

  useEffect(() => {
    if (!payment.pixExpiresAt) return;
    setCountdown(formatCountdown(payment.pixExpiresAt));
    const id = setInterval(() => setCountdown(formatCountdown(payment.pixExpiresAt!)), 1000);
    return () => clearInterval(id);
  }, [payment.pixExpiresAt]);

  async function copyPix() {
    if (!payment.pixQrCode) return;
    await navigator.clipboard.writeText(payment.pixQrCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="flex flex-col items-center gap-6 py-4">
      <div className="text-center">
        <p className="text-sm text-muted-foreground">Escaneie o QR Code ou copie o código PIX</p>
        {countdown && (
          <p className="mt-1 text-xs text-orange-500 font-medium">Expira em {countdown}</p>
        )}
      </div>

      {payment.pixQrCodeBase64 && (
        <div className="rounded-2xl border-4 border-border p-2 bg-white shadow-sm">
          <img
            src={payment.pixQrCodeBase64}
            alt="QR Code PIX"
            width={200}
            height={200}
            className="block"
          />
        </div>
      )}

      {payment.pixQrCode && (
        <div className="w-full space-y-2">
          <p className="text-xs font-medium text-center text-muted-foreground uppercase tracking-wide">
            Código PIX Copia e Cola
          </p>
          <div className="flex gap-2">
            <div className="flex-1 rounded-lg border border-border bg-muted px-3 py-2 text-xs font-mono text-muted-foreground overflow-hidden">
              <p className="truncate">{payment.pixQrCode}</p>
            </div>
            <button
              type="button"
              onClick={copyPix}
              className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted transition-colors"
            >
              {copied ? '✓ Copiado' : 'Copiar'}
            </button>
          </div>
        </div>
      )}

      <div className="w-full rounded-xl bg-muted/60 p-4 text-sm text-muted-foreground space-y-1.5">
        <p className="font-medium text-foreground">Como pagar:</p>
        <ol className="list-decimal list-inside space-y-1 text-xs">
          <li>Abra o app do seu banco</li>
          <li>Selecione a opção PIX</li>
          <li>Escaneie o QR Code ou cole o código</li>
          <li>Confirme o pagamento</li>
        </ol>
      </div>
    </div>
  );
}
