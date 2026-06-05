'use client';

import { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';

interface CardFormInnerProps {
  clientSecret: string;
  onSuccess: () => void;
  onError: (msg: string) => void;
}

function CardFormInner({ clientSecret, onSuccess, onError }: CardFormInnerProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    try {
      const card = elements.getElement(CardElement);
      if (!card) throw new Error('Formulário de cartão não encontrado.');

      const result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: { card },
      });

      if (result.error) {
        onError(result.error.message ?? 'Pagamento recusado.');
      } else {
        onSuccess();
      }
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm font-medium">Dados do cartão</label>
        <div className="rounded-lg border border-input bg-background px-3 py-3">
          <CardElement
            options={{
              style: {
                base: {
                  fontSize: '14px',
                  color: '#09090b',
                  fontFamily: 'inherit',
                  '::placeholder': { color: '#a1a1aa' },
                },
                invalid: { color: '#ef4444' },
              },
              hidePostalCode: true,
            }}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={!stripe || submitting}
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
        Pagamento seguro via Stripe
      </div>
    </form>
  );
}

interface CardFormProps {
  clientSecret: string;
  publishableKey: string;
  onSuccess: () => void;
  onError: (msg: string) => void;
}

export function CardForm({ clientSecret, publishableKey, onSuccess, onError }: CardFormProps) {
  const stripePromise = loadStripe(publishableKey);

  return (
    <Elements stripe={stripePromise} options={{ clientSecret, locale: 'pt-BR' }}>
      <CardFormInner clientSecret={clientSecret} onSuccess={onSuccess} onError={onError} />
    </Elements>
  );
}
