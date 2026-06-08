export type InvoiceProviderStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'AUTHORIZED'
  | 'REJECTED'
  | 'CANCELLED';

export interface IssuedInvoice {
  reference: string;
  status: InvoiceProviderStatus;
  invoiceNumber?: string;
  accessKey?: string;
  protocol?: string;
  xmlUrl?: string;
  danfeUrl?: string;
  issueDate?: Date;
  cancellationDate?: Date;
  errorMessage?: string;
}

export interface InvoiceItemPayload {
  sku: string;
  name: string;
  ncm?: string;
  cfop?: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  total: number;
}

export interface InvoiceCustomerPayload {
  name: string;
  email: string;
  cpf?: string;
  address?: {
    cep: string;
    street: string;
    number: string;
    complement?: string;
    neighborhood: string;
    city: string;
    state: string;
  };
}

export interface InvoicePayload {
  reference: string;
  customer: InvoiceCustomerPayload;
  items: InvoiceItemPayload[];
  paymentMethod: string;
  total: number;
  freight?: number;
  discount?: number;
  additionalInfo?: string;
}

export interface InvoiceProvider {
  issueInvoice(payload: InvoicePayload): Promise<IssuedInvoice>;
  getInvoice(reference: string): Promise<IssuedInvoice>;
  cancelInvoice(reference: string, reason: string): Promise<void>;
  downloadXml(reference: string): Promise<string>;
  downloadDanfe(reference: string): Promise<string>;
  syncStatus(reference: string): Promise<IssuedInvoice>;
  isConfigured(): boolean;
}
