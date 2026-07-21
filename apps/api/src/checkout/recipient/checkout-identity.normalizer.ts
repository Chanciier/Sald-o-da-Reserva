import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { ShippingAddressDto } from '../dto/create-order.dto';

// Camada normalizadora do checkout: traduz um RecipientProfile/SavedAddress
// (ou dados digitados inline) para o MESMO shape que o Order já grava hoje.
// Nada aqui é lido de novo por integrações externas — o resultado é copiado
// para colunas do Order na criação do pedido, e MP/Focus NF-e/Melhor Envio
// continuam lendo exclusivamente do Order/User, como sempre leram.

export interface CheckoutIdentitySnapshot {
  recipientProfileId: string | null;
  buyerName: string | null;
  recipientDocument: string | null;
  recipientDocumentType: DocumentType | null;
  recipientEmail: string | null;
}

export type CheckoutAddressSnapshot = ShippingAddressDto;

@Injectable()
export class CheckoutIdentityNormalizer {
  constructor(private readonly prisma: PrismaService) {}

  // Sem recipientProfileId: comportamento 100% inline, idêntico ao de hoje.
  // Com recipientProfileId: perfil precisa pertencer ao usuário autenticado
  // (senão 404 — nunca revela se o perfil existe para outro dono) e passa a
  // ser a fonte de nome/documento/e-mail, sobrepondo o que vier solto no DTO.
  async resolveIdentity(
    userId: string,
    input: { recipientProfileId?: string; buyerName?: string; cpf?: string },
  ): Promise<CheckoutIdentitySnapshot> {
    if (!input.recipientProfileId) {
      return {
        recipientProfileId: null,
        buyerName: input.buyerName ?? null,
        recipientDocument: input.cpf ?? null,
        recipientDocumentType: input.cpf ? DocumentType.CPF : null,
        recipientEmail: null,
      };
    }

    const profile = await this.prisma.recipientProfile.findFirst({
      where: { id: input.recipientProfileId, userId },
    });
    if (!profile) throw new NotFoundException('Perfil de destinatário não encontrado.');

    return {
      recipientProfileId: profile.id,
      buyerName: profile.name,
      recipientDocument: profile.document,
      recipientDocumentType: profile.documentType,
      recipientEmail: profile.email ?? null,
    };
  }

  // Sem savedAddressId: usa dto.shippingAddress inline, idêntico a hoje.
  // Com savedAddressId: endereço precisa pertencer a um perfil do usuário
  // autenticado — e, se um recipientProfileId também foi informado, precisa
  // pertencer EXATAMENTE a esse perfil (evita misturar endereço de um perfil
  // com identidade de outro).
  async resolveAddress(
    userId: string,
    recipientProfileId: string | null,
    input: { savedAddressId?: string; shippingAddress?: ShippingAddressDto },
  ): Promise<{ savedAddressId: string | null; address: CheckoutAddressSnapshot }> {
    if (!input.savedAddressId) {
      if (!input.shippingAddress) {
        throw new BadRequestException('Endereço de entrega obrigatório para envio.');
      }
      return { savedAddressId: null, address: input.shippingAddress };
    }

    const saved = await this.prisma.savedAddress.findFirst({
      where: {
        id: input.savedAddressId,
        recipientProfile: {
          userId,
          ...(recipientProfileId ? { id: recipientProfileId } : {}),
        },
      },
      include: { recipientProfile: true },
    });
    if (!saved) throw new NotFoundException('Endereço salvo não encontrado.');

    return {
      savedAddressId: saved.id,
      address: {
        name: saved.recipientProfile.name,
        cep: saved.postalCode,
        street: saved.street,
        number: saved.number,
        complement: saved.complement ?? undefined,
        neighborhood: saved.neighborhood,
        city: saved.city,
        state: saved.state,
      },
    };
  }
}
