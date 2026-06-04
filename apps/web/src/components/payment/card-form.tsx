'use client';

import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    MercadoPago: new (key: string, opts: { locale: string }) => MpInstance;
  }
}

interface MpCardFormData {
  token: string;
  paymentMethodId: string;
  installments: string;
  issuerId: string;
  identificationNumber: string;
  identificationType: string;
  cardholderEmail: string;
}

interface MpInstance {
  cardForm: (config: MpCardFormConfig) => MpCardForm;
}

interface MpCardForm {
  getCardFormData: () => MpCardFormData;
  unmount: () => void;
}

interface MpCardFormConfig {
  amount: string;
  iframe: boolean;
  form: Record<string, { id: string; placeholder?: string }>;
  callbacks: {
    onFormMounted: (err: unknown) => void;
    onSubmit: (e: { preventDefault(): void }) => void;
    onFetchingIssuers?: () => void;
    onFetchingInstallments?: () => void;
  };
}

interface CardFormProps {
  amount: number;
  publicKey: string;
  onSubmit: (data: {
    token: string;
    paymentMethodId: string;
    installments: number;
  }) => Promise<void>;
  disabled?: boolean;
}

export function CardForm({ amount, publicKey, onSubmit, disabled }: CardFormProps) {
  const cardFormRef = useRef<MpCardForm | null>(null);
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    function init() {
      if (!mounted || !window.MercadoPago) return;
      const mp = new window.MercadoPago(publicKey, { locale: 'pt-BR' });

      cardFormRef.current = mp.cardForm({
        amount: String(amount.toFixed(2)),
        iframe: true,
        form: {
          id: { id: 'mp-card-form' },
          cardNumber: { id: 'mp-cardNumber', placeholder: '0000 0000 0000 0000' },
          expirationDate: { id: 'mp-expiration', placeholder: 'MM/AA' },
          securityCode: { id: 'mp-cvv', placeholder: 'CVV' },
          cardholderName: { id: 'mp-cardholderName', placeholder: 'Nome como no cartão' },
          issuer: { id: 'mp-issuer' },
          installments: { id: 'mp-installments' },
          identificationType: { id: 'mp-idType' },
          identificationNumber: { id: 'mp-idNumber', placeholder: '000.000.000-00' },
          cardholderEmail: { id: 'mp-email', placeholder: 'seu@email.com' },
        },
        callbacks: {
          onFormMounted: (err) => {
            if (err) {
              setError('Erro ao carregar formulário de pagamento.');
              return;
            }
            if (mounted) setReady(true);
          },
          onSubmit: async (e) => {
            e.preventDefault();
            setError('');
            setSubmitting(true);
            try {
              const data = cardFormRef.current!.getCardFormData();
              if (!data.token)
                throw new Error('Não foi possível tokenizar o cartão. Verifique os dados.');
              await onSubmit({
                token: data.token,
                paymentMethodId: data.paymentMethodId,
                installments: parseInt(data.installments, 10) || 1,
              });
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setSubmitting(false);
            }
          },
        },
      });
    }

    if (window.MercadoPago) {
      init();
    } else {
      const script = document.createElement('script');
      script.src = 'https://sdk.mercadopago.com/js/v2';
      script.onload = init;
      script.onerror = () => setError('Falha ao carregar SDK do Mercado Pago.');
      document.head.appendChild(script);
    }

    return () => {
      mounted = false;
      cardFormRef.current?.unmount();
    };
  }, [amount, publicKey]);

  const inputClass =
    'h-10 w-full rounded-lg border border-input bg-background overflow-hidden [&_iframe]:!border-0 [&_iframe]:!outline-none';

  return (
    <form id="mp-card-form" className="space-y-4">
      {!ready && !error && (
        <div className="flex items-center justify-center py-8 text-sm text-muted-foreground gap-2">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
            />
          </svg>
          Carregando formulário seguro...
        </div>
      )}

      <div className={ready ? '' : 'invisible h-0 overflow-hidden'}>
        <div>
          <label className="mb-1 block text-sm font-medium">Número do cartão</label>
          <div id="mp-cardNumber" className={inputClass} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Validade</label>
            <div id="mp-expiration" className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">CVV</label>
            <div id="mp-cvv" className={inputClass} />
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-sm font-medium">Nome no cartão</label>
          <div id="mp-cardholderName" className={inputClass} />
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-sm font-medium">CPF do titular</label>
          <div className="hidden">
            <select id="mp-idType" />
          </div>
          <div id="mp-idNumber" className={inputClass} />
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-sm font-medium">E-mail</label>
          <div id="mp-email" className={inputClass} />
        </div>

        <div className="mt-4 hidden">
          <select id="mp-issuer" />
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-sm font-medium">Parcelas</label>
          <select
            id="mp-installments"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={!ready || submitting || disabled}
          className="mt-4 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {submitting ? 'Processando...' : `Pagar com cartão`}
        </button>

        <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
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
      </div>

      {error && ready && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
