import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AuthenticatedUser } from '../auth/types/auth.types';
import { FocusNfeProvider } from './focusnfe.provider';
import { InvoiceRepository } from './invoice.repository';
import { InvoiceService } from './invoice.service';
import { CreateManualInvoiceDto } from './dto/create-manual-invoice.dto';
import {
  isValidCnpj,
  isValidCpf,
  manualInvoicePayload,
  normalizeManualInvoice,
} from './manual-invoice';

const VALID_CPF = '529.982.247-25';
const VALID_CNPJ = '11.222.333/0001-81';

function dto(overrides: Partial<CreateManualInvoiceDto> = {}): CreateManualInvoiceDto {
  return {
    buyer: {
      name: ' Maria Compradora ',
      document: VALID_CPF,
      email: 'maria@example.com',
      address: {
        cep: '12245-000',
        street: 'Rua A',
        number: '10',
        neighborhood: 'Centro',
        city: 'São José dos Campos',
        state: 'sp',
      },
    },
    items: [
      { description: 'Furadeira', quantity: 2, unitPrice: 50.5, ncm: '8467.21.00' },
      { description: 'Broca', quantity: 1, unitPrice: 9.9 },
    ],
    paymentMethod: 'PIX',
    ...overrides,
  };
}

describe('manual invoice helpers', () => {
  it('validates CPF and CNPJ check digits', () => {
    expect(isValidCpf(VALID_CPF)).toBe(true);
    expect(isValidCpf('529.982.247-24')).toBe(false);
    expect(isValidCpf('111.111.111-11')).toBe(false);
    expect(isValidCnpj(VALID_CNPJ)).toBe(true);
    expect(isValidCnpj('11.222.333/0001-80')).toBe(false);
  });

  it('rejects an invalid buyer document', () => {
    expect(() =>
      normalizeManualInvoice(dto({ buyer: { ...dto().buyer, document: '123.456.789-00' } })),
    ).toThrow(BadRequestException);
  });

  it('normalizes the sale and computes totals', () => {
    const data = normalizeManualInvoice(dto());
    expect(data.buyer).toMatchObject({ name: 'Maria Compradora', document: '52998224725' });
    expect(data.buyer.address).toMatchObject({ cep: '12245000', state: 'SP' });
    expect(data.items).toEqual([
      expect.objectContaining({ sku: 'AVULSO-1', ncm: '84672100', total: 101 }),
      expect.objectContaining({ sku: 'AVULSO-2', total: 9.9 }),
    ]);
    expect(data.items[1]).not.toHaveProperty('ncm');
    expect(data.total).toBe(110.9);
  });

  it('sends a CNPJ buyer as cnpj, not cpf', () => {
    const data = normalizeManualInvoice(dto({ buyer: { ...dto().buyer, document: VALID_CNPJ } }));
    const payload = manualInvoicePayload(data, 'ref-1');
    expect(payload.customer.cnpj).toBe('11222333000181');
    expect(payload.customer.cpf).toBeUndefined();
    expect(payload).toMatchObject({ reference: 'ref-1', total: 110.9, customerState: 'SP' });
  });
});

describe('FocusNfeProvider payload for standalone buyers', () => {
  const provider = new FocusNfeProvider({
    get: (_key: string, fallback?: string) => fallback ?? '',
  } as unknown as ConfigService);
  const build = (payload: unknown) =>
    (
      provider as unknown as { buildNfePayload: (p: unknown, d: string) => Record<string, unknown> }
    ).buildNfePayload(payload, '2026-09-28T12:00:00Z');

  it('uses cnpj_destinatario and omits a missing e-mail', () => {
    const data = normalizeManualInvoice(
      dto({ buyer: { ...dto().buyer, document: VALID_CNPJ, email: undefined } }),
    );
    const body = build(manualInvoicePayload(data, 'ref-2'));
    expect(body.cnpj_destinatario).toBe('11222333000181');
    expect(body).not.toHaveProperty('cpf_destinatario');
    expect(body).not.toHaveProperty('email_destinatario');
  });

  it('maps cash payments to code 01', () => {
    const data = normalizeManualInvoice(dto({ paymentMethod: 'CASH' }));
    const body = build(manualInvoicePayload(data, 'ref-3'));
    expect(body.formas_pagamento).toEqual([
      expect.objectContaining({ forma_pagamento: '01', valor_pagamento: 110.9 }),
    ]);
  });
});

describe('InvoiceService standalone invoices', () => {
  const admin = { id: 'admin-1', role: 'ADMIN' } as unknown as AuthenticatedUser;
  let service: InvoiceService;
  let focus: { isConfigured: jest.Mock; issueInvoice: jest.Mock };
  let repo: { create: jest.Mock; update: jest.Mock; findById: jest.Mock };
  let mail: { sendInvoiceEmail: jest.Mock };

  beforeEach(() => {
    focus = {
      isConfigured: jest.fn().mockReturnValue(true),
      issueInvoice: jest.fn().mockResolvedValue({
        status: 'AUTHORIZED',
        invoiceNumber: '123',
        danfeUrl: 'https://danfe',
      }),
    };
    repo = {
      create: jest.fn().mockResolvedValue({ id: 'invoice-1' }),
      update: jest.fn().mockResolvedValue({}),
      findById: jest.fn().mockResolvedValue({ id: 'invoice-1' }),
    };
    mail = { sendInvoiceEmail: jest.fn().mockResolvedValue(undefined) };
    service = new InvoiceService(
      { auditLog: { create: jest.fn() } } as unknown as PrismaService,
      focus as unknown as FocusNfeProvider,
      repo as unknown as InvoiceRepository,
      mail as unknown as MailService,
    );
  });

  it('stores the sale snapshot without an order and records the Focus result', async () => {
    await service.emitManual(dto(), admin);

    expect(repo.create).toHaveBeenCalledWith({
      manualData: expect.objectContaining({ total: 110.9 }),
    });
    expect(focus.issueInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: expect.objectContaining({ cpf: '52998224725', email: 'maria@example.com' }),
        paymentMethod: 'PIX',
      }),
    );
    expect(repo.update).toHaveBeenCalledWith(
      'invoice-1',
      expect.objectContaining({ status: 'AUTHORIZED', invoiceNumber: '123' }),
    );
    expect(mail.sendInvoiceEmail).toHaveBeenCalledWith(
      'maria@example.com',
      'Maria Compradora',
      'https://danfe',
      undefined,
      '123',
      undefined,
    );
  });

  it('marks the invoice as rejected when Focus fails', async () => {
    focus.issueInvoice.mockRejectedValue(new Error('FocusNFe: NCM inexistente'));

    await service.emitManual(dto(), admin);

    expect(repo.update).toHaveBeenCalledWith('invoice-1', {
      status: 'REJECTED',
      errorMessage: 'FocusNFe: NCM inexistente',
    });
  });

  it('refuses to start when Focus NFe is not configured', async () => {
    focus.isConfigured.mockReturnValue(false);
    await expect(service.emitManual(dto(), admin)).rejects.toThrow(BadRequestException);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('re-issues a rejected standalone invoice from its stored snapshot', async () => {
    const manualData = normalizeManualInvoice(dto());
    repo.findById.mockResolvedValue({
      id: 'invoice-1',
      orderId: null,
      status: 'REJECTED',
      manualData,
    });

    await service.reemit('invoice-1', admin);

    expect(focus.issueInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ total: 110.9, customerState: 'SP' }),
    );
  });
});
