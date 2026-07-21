export type DocumentType = 'CPF' | 'CNPJ';

export interface SavedAddress {
  id: string;
  recipientProfileId: string;
  label: string;
  postalCode: string;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RecipientProfile {
  id: string;
  userId: string;
  label: string;
  name: string;
  documentType: DocumentType;
  document: string;
  phone: string | null;
  email: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  addresses: SavedAddress[];
}

export interface CreateRecipientProfileInput {
  label: string;
  name: string;
  documentType?: DocumentType;
  document: string;
  phone?: string;
  email?: string;
  isDefault?: boolean;
}

export interface CreateSavedAddressInput {
  label: string;
  postalCode: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  isDefault?: boolean;
}
