interface MercadoPagoInstance {
  createCardToken(cardData: {
    cardNumber: string;
    cardholderName: string;
    cardExpirationMonth: string;
    cardExpirationYear: string;
    securityCode: string;
    identificationType: string;
    identificationNumber: string;
  }): Promise<{
    id: string;
    payment_method_id?: string;
    issuer_id?: string;
    last_four_digits?: string;
  }>;
  getInstallments(params: { amount: string; bin: string }): Promise<
    Array<{
      payment_method_id?: string;
      payer_costs: Array<{
        installments: number;
        recommended_message: string;
        total_amount: number;
      }>;
    }>
  >;
}

interface MercadoPagoConstructor {
  new (publicKey: string, options?: { locale?: string }): MercadoPagoInstance;
}

interface Window {
  MercadoPago?: MercadoPagoConstructor;
}
