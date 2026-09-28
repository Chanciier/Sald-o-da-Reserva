import { BadRequestException } from '@nestjs/common';
import type { CreateManualInvoiceDto, ManualPaymentMethod } from './dto/create-manual-invoice.dto';
import type { InvoicePayload } from './invoice.provider';

export interface ManualInvoiceData {
  buyer: {
    name: string;
    document: string;
    email?: string;
    address: {
      cep: string;
      street: string;
      number: string;
      complement?: string;
      neighborhood: string;
      city: string;
      state: string;
    };
  };
  items: Array<{
    description: string;
    sku: string;
    ncm?: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  paymentMethod: ManualPaymentMethod;
  inPerson: boolean;
  additionalInfo?: string;
  total: number;
}

const onlyDigits = (v: string) => v.replace(/\D/g, '');
const round2 = (n: number) => Math.round(n * 100) / 100;

export function isValidCpf(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

export function isValidCnpj(value: string): boolean {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const digit = (len: number) => {
    let sum = 0;
    let weight = len - 7;
    for (let i = 0; i < len; i++) {
      sum += Number(cnpj[i]) * weight;
      weight = weight === 2 ? 9 : weight - 1;
    }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return digit(12) === Number(cnpj[12]) && digit(13) === Number(cnpj[13]);
}

export function normalizeManualInvoice(dto: CreateManualInvoiceDto): ManualInvoiceData {
  const document = onlyDigits(dto.buyer.document);
  const docOk = document.length === 11 ? isValidCpf(document) : isValidCnpj(document);
  if (!docOk) throw new BadRequestException('CPF/CNPJ do comprador inválido.');

  const items = dto.items.map((item, idx) => {
    const ncm = item.ncm ? onlyDigits(item.ncm) : undefined;
    return {
      description: item.description.trim(),
      sku: item.sku?.trim() || `AVULSO-${idx + 1}`,
      ...(ncm ? { ncm } : {}),
      quantity: item.quantity,
      unitPrice: round2(item.unitPrice),
      total: round2(item.quantity * item.unitPrice),
    };
  });

  const { address } = dto.buyer;
  return {
    buyer: {
      name: dto.buyer.name.trim(),
      document,
      ...(dto.buyer.email ? { email: dto.buyer.email.trim() } : {}),
      address: {
        cep: onlyDigits(address.cep),
        street: address.street.trim(),
        number: address.number.trim(),
        ...(address.complement?.trim() ? { complement: address.complement.trim() } : {}),
        neighborhood: address.neighborhood.trim(),
        city: address.city.trim(),
        state: address.state.trim().toUpperCase(),
      },
    },
    items,
    paymentMethod: dto.paymentMethod,
    inPerson: dto.inPerson ?? false,
    ...(dto.additionalInfo?.trim() ? { additionalInfo: dto.additionalInfo.trim() } : {}),
    total: round2(items.reduce((s, i) => s + i.total, 0)),
  };
}

export function manualInvoicePayload(data: ManualInvoiceData, reference: string): InvoicePayload {
  const { buyer } = data;
  const isCompany = buyer.document.length === 14;
  return {
    reference,
    customer: {
      name: buyer.name,
      email: buyer.email,
      ...(isCompany ? { cnpj: buyer.document } : { cpf: buyer.document }),
      address: buyer.address,
    },
    items: data.items.map((item) => ({
      sku: item.sku,
      name: item.description,
      ncm: item.ncm,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.total,
    })),
    paymentMethod: data.paymentMethod,
    total: data.total,
    isPickup: data.inPerson,
    customerState: buyer.address.state,
    additionalInfo: data.additionalInfo,
  };
}
