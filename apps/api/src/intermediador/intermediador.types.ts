// Mesmo contrato de POST /integrations/ecommerce/club-members no intermediador
// (EasyPDV) — ver apps/intermediador/src/modules/ecommerce-integration lá.

export interface AddClubMemberInput {
  name: string;
  /** CPF, apenas dígitos. */
  document: string;
  /** ISO 8601. */
  validUntil: string;
  phone: string;
  whatsappConsent?: boolean;
}

export interface AddClubMemberResult {
  document: string;
  name: string;
  validUntil: string | null;
}
