import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DocumentType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RecipientProfilesService } from './recipient-profiles.service';

describe('RecipientProfilesService', () => {
  let service: RecipientProfilesService;
  let prisma: {
    recipientProfile: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      delete: jest.Mock;
    };
    savedAddress: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      delete: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const USER_ID = 'user-1';

  beforeEach(() => {
    prisma = {
      recipientProfile: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        delete: jest.fn(),
      },
      savedAddress: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        delete: jest.fn(),
      },
      // $transaction here just runs the callback against the same mocked client,
      // matching how these tests exercise the transactional methods.
      $transaction: jest.fn((cb) => cb(prisma)),
    };
    service = new RecipientProfilesService(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    it('creates a CPF profile with the default document type', async () => {
      prisma.recipientProfile.create.mockResolvedValue({ id: 'p1' });

      await service.create(USER_ID, {
        label: 'Eu mesmo',
        name: 'Cliente Teste',
        document: '11122233396',
      });

      expect(prisma.recipientProfile.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: USER_ID,
          documentType: DocumentType.CPF,
          document: '11122233396',
          isDefault: false,
        }),
      });
    });

    it('rejects a CPF with the wrong number of digits', async () => {
      await expect(
        service.create(USER_ID, { label: 'X', name: 'X', document: '123' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.recipientProfile.create).not.toHaveBeenCalled();
    });

    it('accepts a 14-digit CNPJ when documentType is CNPJ', async () => {
      prisma.recipientProfile.create.mockResolvedValue({ id: 'p1' });

      await service.create(USER_ID, {
        label: 'Empresa',
        name: 'Empresa LTDA',
        documentType: DocumentType.CNPJ,
        document: '12345678000199',
      });

      expect(prisma.recipientProfile.create).toHaveBeenCalled();
    });

    it('unsets other defaults when creating a new default profile', async () => {
      prisma.recipientProfile.create.mockResolvedValue({ id: 'p2' });

      await service.create(USER_ID, {
        label: 'Novo padrão',
        name: 'X',
        document: '11122233396',
        isDefault: true,
      });

      expect(prisma.recipientProfile.updateMany).toHaveBeenCalledWith({
        where: { userId: USER_ID, isDefault: true },
        data: { isDefault: false },
      });
    });
  });

  describe('update', () => {
    it('throws NotFoundException for a profile belonging to another user', async () => {
      prisma.recipientProfile.findFirst.mockResolvedValue(null);

      await expect(service.update(USER_ID, 'someone-elses-profile', { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.recipientProfile.update).not.toHaveBeenCalled();
    });

    it('validates the new document length against the (possibly updated) document type', async () => {
      prisma.recipientProfile.findFirst.mockResolvedValue({
        id: 'p1',
        userId: USER_ID,
        documentType: DocumentType.CPF,
        document: '11122233396',
      });

      await expect(
        service.update(USER_ID, 'p1', { documentType: DocumentType.CNPJ }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('throws NotFoundException for a profile belonging to another user', async () => {
      prisma.recipientProfile.findFirst.mockResolvedValue(null);
      await expect(service.remove(USER_ID, 'not-mine')).rejects.toThrow(NotFoundException);
      expect(prisma.recipientProfile.delete).not.toHaveBeenCalled();
    });

    it('deletes an owned profile', async () => {
      prisma.recipientProfile.findFirst.mockResolvedValue({ id: 'p1', userId: USER_ID });
      const result = await service.remove(USER_ID, 'p1');
      expect(prisma.recipientProfile.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
      expect(result).toEqual({ id: 'p1', deleted: true });
    });
  });

  describe('addAddress', () => {
    it('throws NotFoundException when the profile does not belong to the user', async () => {
      prisma.recipientProfile.findFirst.mockResolvedValue(null);

      await expect(
        service.addAddress(USER_ID, 'not-mine', {
          label: 'Casa',
          postalCode: '12345678',
          street: 'Rua A',
          number: '1',
          neighborhood: 'Centro',
          city: 'SJC',
          state: 'sp',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.savedAddress.create).not.toHaveBeenCalled();
    });

    it('creates the address and uppercases the state', async () => {
      prisma.recipientProfile.findFirst.mockResolvedValue({ id: 'p1' });
      prisma.savedAddress.create.mockResolvedValue({ id: 'a1' });

      await service.addAddress(USER_ID, 'p1', {
        label: 'Casa',
        postalCode: '12345678',
        street: 'Rua A',
        number: '1',
        neighborhood: 'Centro',
        city: 'SJC',
        state: 'sp',
      });

      expect(prisma.savedAddress.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ recipientProfileId: 'p1', state: 'SP' }),
      });
    });
  });

  describe('updateAddress / removeAddress', () => {
    it('throws NotFoundException when the address does not belong to the user/profile', async () => {
      prisma.savedAddress.findFirst.mockResolvedValue(null);

      await expect(
        service.updateAddress(USER_ID, 'p1', 'not-mine', { label: 'X' }),
      ).rejects.toThrow(NotFoundException);
      await expect(service.removeAddress(USER_ID, 'p1', 'not-mine')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
