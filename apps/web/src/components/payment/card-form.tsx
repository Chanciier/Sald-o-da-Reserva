'use client';

interface CardFormProps {
  clientSecret: string;
  onSuccess: (paymentIntentId: string) => void;
  onError: (msg: string) => void;
}

export function CardForm({ onError: _onError, onSuccess: _onSuccess }: CardFormProps) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <svg
          className="h-6 w-6 text-muted-foreground"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
          />
        </svg>
      </div>
      <div>
        <p className="font-medium">Pagamento com cartão em breve</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Utilize PIX ou Boleto enquanto finalizamos a integração.
        </p>
      </div>
    </div>
  );
}
