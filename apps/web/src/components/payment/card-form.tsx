'use client';

import { useCallback, useEffect, useState } from 'react';
import type { InstallmentOption } from '@/types/payment';

interface CardFormProps {
  amount: number;
  publicKey: string;
  onSubmit: (data: {
    token: string;
    installments: number;
    paymentMethodId: string;
    issuerId?: string;
    identificationNumber: string;
  }) => Promise<void>;
  onError: (msg: string) => void;
}

function formatCardNumber(v: string) {
  return v
    .replace(/\D/g, '')
    .slice(0, 16)
    .replace(/(\d{4})(?=\d)/g, '$1 ')
    .trim();
}

function formatCpf(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function formatExpiry(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 4);
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}/${d.slice(2)}`;
}

const MIN_INSTALLMENT_AMOUNT = 100;

export function CardForm({ amount, publicKey, onSubmit, onError }: CardFormProps) {
  const allowInstallments = amount >= MIN_INSTALLMENT_AMOUNT;
  const [mp, setMp] = useState<MercadoPagoInstance | null>(null);
  const [sdkLoading, setSdkLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [cardNumber, setCardNumber] = useState('');
  const [cardholderName, setCardholderName] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [cpf, setCpf] = useState('');
  const [installments, setInstallments] = useState(1);
  const [installmentOptions, setInstallmentOptions] = useState<InstallmentOption[]>([]);
  const [loadingInstallments, setLoadingInstallments] = useState(false);
  const [detectedPaymentMethodId, setDetectedPaymentMethodId] = useState<string>('');

  useEffect(() => {
    if (window.MercadoPago) {
      setMp(new window.MercadoPago(publicKey, { locale: 'pt-BR' }));
      setSdkLoading(false);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://sdk.mercadopago.com/js/v2';
    script.async = true;
    script.onload = () => {
      if (window.MercadoPago) {
        setMp(new window.MercadoPago(publicKey, { locale: 'pt-BR' }));
      }
      setSdkLoading(false);
    };
    script.onerror = () => {
      onError('Não foi possível carregar o SDK do Mercado Pago.');
      setSdkLoading(false);
    };
    document.body.appendChild(script);
  }, [publicKey, onError]);

  const loadInstallments = useCallback(
    async (bin: string) => {
      if (!mp || bin.length < 6) {
        setInstallmentOptions([]);
        return;
      }
      setLoadingInstallments(true);
      try {
        const result = await mp.getInstallments({ amount: amount.toFixed(2), bin });
        const first = result[0];
        if (first?.payment_method_id) setDetectedPaymentMethodId(first.payment_method_id);

        // Installment options only matter when the order qualifies for parcelamento —
        // but the bin lookup above must always run, since it's the only place the
        // card's payment_method_id (bandeira) gets detected before submit.
        if (!allowInstallments) return;

        const costs = first?.payer_costs ?? [];
        setInstallmentOptions(
          costs.map((c) => ({
            installments: c.installments,
            recommended_message: c.recommended_message,
            total_amount: c.total_amount,
          })),
        );
        if (costs.length && !costs.find((c) => c.installments === installments)) {
          setInstallments(costs[0].installments);
        }
      } catch {
        if (allowInstallments) {
          setInstallmentOptions([
            { installments: 1, recommended_message: '1x', total_amount: amount },
          ]);
        }
      } finally {
        setLoadingInstallments(false);
      }
    },
    [mp, amount, installments, allowInstallments],
  );

  useEffect(() => {
    if (!allowInstallments) {
      setInstallments(1);
      setInstallmentOptions([]);
    }
    const bin = cardNumber.replace(/\D/g, '').slice(0, 6);
    if (bin.length === 6) loadInstallments(bin);
  }, [cardNumber, loadInstallments, allowInstallments]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!mp) {
      onError('SDK do Mercado Pago não carregado.');
      return;
    }

    const cleanCpf = cpf.replace(/\D/g, '');
    if (cleanCpf.length !== 11) {
      onError('Informe um CPF válido.');
      return;
    }

    const [month, yearShort] = expiry.split('/');
    if (!month || !yearShort || month.length !== 2 || yearShort.length !== 2) {
      onError('Data de validade inválida.');
      return;
    }

    setSubmitting(true);
    try {
      const tokenResult = await mp.createCardToken({
        cardNumber: cardNumber.replace(/\D/g, ''),
        cardholderName: cardholderName.trim(),
        cardExpirationMonth: month,
        cardExpirationYear: `20${yearShort}`,
        securityCode: cvv.replace(/\D/g, ''),
        identificationType: 'CPF',
        identificationNumber: cleanCpf,
      });

      if (!tokenResult.id) throw new Error('Falha ao tokenizar o cartão.');

      let pmId = tokenResult.payment_method_id || detectedPaymentMethodId;
      if (!pmId && mp) {
        // Fallback for the case where the user submits before the bin lookup
        // (triggered on card-number change) has finished resolving.
        const bin = cardNumber.replace(/\D/g, '').slice(0, 6);
        if (bin.length === 6) {
          try {
            const result = await mp.getInstallments({ amount: amount.toFixed(2), bin });
            pmId = result[0]?.payment_method_id ?? '';
            if (pmId) setDetectedPaymentMethodId(pmId);
          } catch {
            // ignore — falls through to the error below
          }
        }
      }
      if (!pmId)
        throw new Error(
          'Não foi possível identificar a bandeira do cartão. Verifique o número e tente novamente.',
        );

      await onSubmit({
        token: tokenResult.id,
        installments,
        paymentMethodId: pmId,
        issuerId: tokenResult.issuer_id,
        identificationNumber: cleanCpf,
      });
    } catch (err) {
      onError((err as Error).message ?? 'Erro ao processar cartão.');
    } finally {
      setSubmitting(false);
    }
  }

  if (sdkLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Spinner /> Carregando formulário...
      </div>
    );
  }

  if (!publicKey) {
    return (
      <p className="py-6 text-center text-sm text-destructive">
        Chave pública do Mercado Pago não configurada (NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY).
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium">Número do cartão</label>
        <input
          type="text"
          inputMode="numeric"
          placeholder="0000 0000 0000 0000"
          value={cardNumber}
          onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
          required
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Nome no cartão</label>
        <input
          type="text"
          placeholder="Como impresso no cartão"
          value={cardholderName}
          onChange={(e) => setCardholderName(e.target.value)}
          required
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium">Validade</label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="MM/AA"
            value={expiry}
            onChange={(e) => setExpiry(formatExpiry(e.target.value))}
            required
            maxLength={5}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">CVV</label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="123"
            value={cvv}
            onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
            required
            maxLength={4}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">CPF do titular</label>
        <input
          type="text"
          inputMode="numeric"
          placeholder="000.000.000-00"
          value={cpf}
          onChange={(e) => setCpf(formatCpf(e.target.value))}
          required
          maxLength={14}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Parcelas</label>
        <select
          value={installments}
          onChange={(e) => setInstallments(parseInt(e.target.value, 10))}
          disabled={loadingInstallments || !allowInstallments}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {(!allowInstallments || !installmentOptions.length
            ? [
                {
                  installments: 1,
                  recommended_message: `1x de R$ ${amount.toFixed(2).replace('.', ',')} (à vista)`,
                  total_amount: amount,
                },
              ]
            : installmentOptions
          ).map((opt) => (
            <option key={opt.installments} value={opt.installments}>
              {opt.recommended_message}
            </option>
          ))}
        </select>
        {!allowInstallments && (
          <p className="mt-1 text-xs text-muted-foreground">
            Parcelamento disponível para compras acima de R$&nbsp;100,00.
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
      >
        {submitting ? 'Processando...' : 'Pagar com cartão'}
      </button>

      <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
          />
        </svg>
        Pagamento seguro via Mercado Pago
      </div>
    </form>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}
