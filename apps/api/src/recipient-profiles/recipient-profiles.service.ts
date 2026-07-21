import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRecipientProfileDto } from './dto/create-recipient-profile.dto';
import { UpdateRecipientProfileDto } from './dto/update-recipient-profile.dto';
import { CreateSavedAddressDto } from './dto/create-saved-address.dto';
import { UpdateSavedAddressDto } from './dto/update-saved-address.dto';

function assertDocumentLength(documentType: DocumentType, document: string) {
  const expected = documentType === DocumentType.CNPJ ? 14 : 11;
  if (document.length !== expected) {
    throw new BadRequestException(
      documentType === DocumentType.CNPJ
        ? 'CNPJ deve conter 14 dígitos numéricos.'
        : 'CPF deve conter 11 dígitos numéricos.',
    );
  }
}

const ADDRESS_ORDER = [{ isDefault: 'desc' as const }, { createdAt: 'asc' as const }];

@Injectable()
export class RecipientProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(userId: string) {
    return this.prisma.recipientProfile.findMany({
      where: { userId },
      include: { addresses: { orderBy: ADDRESS_ORDER } },
      orderBy: ADDRESS_ORDER,
    });
  }

  async findOne(userId: string, id: string) {
    const profile = await this.prisma.recipientProfile.findFirst({
      where: { id, userId },
      include: { addresses: { orderBy: ADDRESS_ORDER } },
    });
    if (!profile) throw new NotFoundException('Perfil de destinatário não encontrado.');
    return profile;
  }

  async create(userId: string, dto: CreateRecipientProfileDto) {
    const documentType = dto.documentType ?? DocumentType.CPF;
    assertDocumentLength(documentType, dto.document);

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.recipientProfile.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.recipientProfile.create({
        data: {
          userId,
          label: dto.label,
          name: dto.name,
          documentType,
          document: dto.document,
          phone: dto.phone,
          email: dto.email,
          isDefault: dto.isDefault ?? false,
        },
      });
    });
  }

  async update(userId: string, id: string, dto: UpdateRecipientProfileDto) {
    const existing = await this.prisma.recipientProfile.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException('Perfil de destinatário não encontrado.');

    const documentType = dto.documentType ?? existing.documentType;
    const document = dto.document ?? existing.document;
    assertDocumentLength(documentType, document);

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.recipientProfile.updateMany({
          where: { userId, isDefault: true, NOT: { id } },
          data: { isDefault: false },
        });
      }
      return tx.recipientProfile.update({
        where: { id },
        data: {
          ...(dto.label !== undefined && { label: dto.label }),
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.documentType !== undefined && { documentType: dto.documentType }),
          ...(dto.document !== undefined && { document: dto.document }),
          ...(dto.phone !== undefined && { phone: dto.phone }),
          ...(dto.email !== undefined && { email: dto.email }),
          ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
        },
      });
    });
  }

  async remove(userId: string, id: string) {
    const existing = await this.prisma.recipientProfile.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException('Perfil de destinatário não encontrado.');
    // Pedidos que usaram este perfil mantêm o snapshot gravado no próprio Order
    // (FK com onDelete: SetNull) — apagar o perfil nunca afeta pedidos, notas
    // fiscais, etiquetas ou pagamentos já existentes.
    await this.prisma.recipientProfile.delete({ where: { id } });
    return { id, deleted: true };
  }

  // ── Endereços ──────────────────────────────────────────────────────────

  private async findOwnedAddress(userId: string, recipientProfileId: string, addressId: string) {
    const address = await this.prisma.savedAddress.findFirst({
      where: { id: addressId, recipientProfileId, recipientProfile: { userId } },
    });
    if (!address) throw new NotFoundException('Endereço salvo não encontrado.');
    return address;
  }

  async addAddress(userId: string, recipientProfileId: string, dto: CreateSavedAddressDto) {
    const profile = await this.prisma.recipientProfile.findFirst({
      where: { id: recipientProfileId, userId },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('Perfil de destinatário não encontrado.');

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.savedAddress.updateMany({
          where: { recipientProfileId, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.savedAddress.create({
        data: {
          recipientProfileId,
          label: dto.label,
          postalCode: dto.postalCode,
          street: dto.street,
          number: dto.number,
          complement: dto.complement,
          neighborhood: dto.neighborhood,
          city: dto.city,
          state: dto.state.toUpperCase(),
          isDefault: dto.isDefault ?? false,
        },
      });
    });
  }

  async updateAddress(
    userId: string,
    recipientProfileId: string,
    addressId: string,
    dto: UpdateSavedAddressDto,
  ) {
    await this.findOwnedAddress(userId, recipientProfileId, addressId);

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.savedAddress.updateMany({
          where: { recipientProfileId, isDefault: true, NOT: { id: addressId } },
          data: { isDefault: false },
        });
      }
      return tx.savedAddress.update({
        where: { id: addressId },
        data: {
          ...(dto.label !== undefined && { label: dto.label }),
          ...(dto.postalCode !== undefined && { postalCode: dto.postalCode }),
          ...(dto.street !== undefined && { street: dto.street }),
          ...(dto.number !== undefined && { number: dto.number }),
          ...(dto.complement !== undefined && { complement: dto.complement }),
          ...(dto.neighborhood !== undefined && { neighborhood: dto.neighborhood }),
          ...(dto.city !== undefined && { city: dto.city }),
          ...(dto.state !== undefined && { state: dto.state.toUpperCase() }),
          ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
        },
      });
    });
  }

  async removeAddress(userId: string, recipientProfileId: string, addressId: string) {
    await this.findOwnedAddress(userId, recipientProfileId, addressId);
    await this.prisma.savedAddress.delete({ where: { id: addressId } });
    return { id: addressId, deleted: true };
  }
}
