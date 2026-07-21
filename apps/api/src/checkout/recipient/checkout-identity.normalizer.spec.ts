import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DocumentType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CheckoutIdentityNormalizer } from './checkout-identity.normalizer';

describe('CheckoutIdentityNormalizer', () => {
  let normalizer: CheckoutIdentityNormalizer;
  let prisma: {
    recipientProfile: { findFirst: jest.Mock };
    savedAddress: { findFirst: jest.Mock };
  };

  const USER_ID = 'user-1';

  beforeEach(() => {
    prisma = {
      recipientProfile: { findFirst: jest.fn() },
      savedAddress: { findFirst: jest.fn() },
    };
    normalizer = new CheckoutIdentityNormalizer(prisma as unknown as PrismaService);
  });

  describe('resolveIdentity', () => {
    it('returns the inline snapshot untouched when no recipientProfileId is given', async () => {
      const result = await normalizer.resolveIdentity(USER_ID, {
        buyerName: 'Fulano',
        cpf: '11122233396',
      });

      expect(result).toEqual({
        recipientProfileId: null,
        buyerName: 'Fulano',
        recipientDocument: '11122233396',
        recipientDocumentType: DocumentType.CPF,
        recipientEmail: null,
      });
      expect(prisma.recipientProfile.findFirst).not.toHaveBeenCalled();
    });

    it('returns an inline snapshot with null document fields when no cpf is given either', async () => {
      const result = await normalizer.resolveIdentity(USER_ID, { buyerName: 'Fulano' });
      expect(result.recipientDocument).toBeNull();
      expect(result.recipientDocumentType).toBeNull();
    });

    it('derives the snapshot from the profile when recipientProfileId is given, overriding inline fields', async () => {
      prisma.recipientProfile.findFirst.mockResolvedValue({
        id: 'profile-1',
        name: 'Maria Souza',
        document: '22233344400',
        documentType: DocumentType.CPF,
        email: 'maria@example.com',
      });

      const result = await normalizer.resolveIdentity(USER_ID, {
        recipientProfileId: 'profile-1',
        buyerName: 'Nome digitado inline (deve ser ignorado)',
        cpf: '99999999999',
      });

      expect(prisma.recipientProfile.findFirst).toHaveBeenCalledWith({
        where: { id: 'profile-1', userId: USER_ID },
      });
      expect(result).toEqual({
        recipientProfileId: 'profile-1',
        buyerName: 'Maria Souza',
        recipientDocument: '22233344400',
        recipientDocumentType: DocumentType.CPF,
        recipientEmail: 'maria@example.com',
      });
    });

    it('throws NotFoundException for a profile that does not belong to the requesting user', async () => {
      prisma.recipientProfile.findFirst.mockResolvedValue(null);

      await expect(
        normalizer.resolveIdentity(USER_ID, { recipientProfileId: 'someone-elses-profile' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('resolveAddress', () => {
    const inlineAddress = {
      name: 'Fulano',
      cep: '12345678',
      street: 'Rua A',
      number: '10',
      neighborhood: 'Centro',
      city: 'SJC',
      state: 'SP',
    };

    it('returns the inline shippingAddress untouched when no savedAddressId is given', async () => {
      const result = await normalizer.resolveAddress(USER_ID, null, {
        shippingAddress: inlineAddress,
      });
      expect(result).toEqual({ savedAddressId: null, address: inlineAddress });
      expect(prisma.savedAddress.findFirst).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when neither savedAddressId nor shippingAddress is given', async () => {
      await expect(normalizer.resolveAddress(USER_ID, null, {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('derives the snapshot from the saved address, using the profile name for the recipient', async () => {
      prisma.savedAddress.findFirst.mockResolvedValue({
        id: 'addr-1',
        postalCode: '12345678',
        street: 'Rua B',
        number: '20',
        complement: 'Apto 1',
        neighborhood: 'Jardim',
        city: 'SJC',
        state: 'SP',
        recipientProfile: { name: 'Maria Souza' },
      });

      const result = await normalizer.resolveAddress(USER_ID, 'profile-1', {
        savedAddressId: 'addr-1',
      });

      expect(prisma.savedAddress.findFirst).toHaveBeenCalledWith({
        where: { id: 'addr-1', recipientProfile: { userId: USER_ID, id: 'profile-1' } },
        include: { recipientProfile: true },
      });
      expect(result).toEqual({
        savedAddressId: 'addr-1',
        address: {
          name: 'Maria Souza',
          cep: '12345678',
          street: 'Rua B',
          number: '20',
          complement: 'Apto 1',
          neighborhood: 'Jardim',
          city: 'SJC',
          state: 'SP',
        },
      });
    });

    it('throws NotFoundException when the saved address does not belong to the user/profile', async () => {
      prisma.savedAddress.findFirst.mockResolvedValue(null);

      await expect(
        normalizer.resolveAddress(USER_ID, 'profile-1', { savedAddressId: 'someone-elses' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
