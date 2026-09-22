import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AddClubMemberInput,
  AddClubMemberResult,
  ClubMembershipStatus,
} from './intermediador.types';

/**
 * Cliente HTTP do intermediador (EasyPDV) — a única ponte entre este backend
 * e o Bling. Usado hoje só pelo ClubMembershipModule (registro de sócio do
 * Clube Reversa), mas fica em módulo próprio caso outras integrações
 * (ex: consulta de estoque físico) precisem dele no futuro.
 */
@Injectable()
export class IntermediadorService {
  private readonly logger = new Logger(IntermediadorService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = this.config.get<string>('INTERMEDIADOR_BASE_URL', '').replace(/\/$/, '');
    this.apiKey = this.config.get<string>('INTERMEDIADOR_API_KEY', '');
    if (!this.baseUrl || !this.apiKey) {
      this.logger.warn('INTERMEDIADOR_BASE_URL/INTERMEDIADOR_API_KEY não configurados.');
    }
  }

  isConfigured(): boolean {
    return Boolean(this.baseUrl && this.apiKey);
  }

  async addClubMember(input: AddClubMemberInput): Promise<AddClubMemberResult> {
    if (!this.isConfigured()) {
      throw new Error(
        'Intermediador não configurado (INTERMEDIADOR_BASE_URL/INTERMEDIADOR_API_KEY).',
      );
    }

    const response = await fetch(`${this.baseUrl}/integrations/ecommerce/club-members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Ecommerce-Api-Key': this.apiKey,
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Intermediador respondeu ${response.status}: ${body}`);
    }

    return (await response.json()) as AddClubMemberResult;
  }

  async checkClubMembership(document: string): Promise<ClubMembershipStatus> {
    if (!this.isConfigured()) {
      throw new Error(
        'Intermediador não configurado (INTERMEDIADOR_BASE_URL/INTERMEDIADOR_API_KEY).',
      );
    }

    const response = await fetch(
      `${this.baseUrl}/integrations/ecommerce/club-members/${encodeURIComponent(document)}`,
      { headers: { 'X-Ecommerce-Api-Key': this.apiKey } },
    );

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Intermediador respondeu ${response.status}: ${body}`);
    }

    return (await response.json()) as ClubMembershipStatus;
  }
}
