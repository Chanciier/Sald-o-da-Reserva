'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Trash2, Send } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { SectionGate } from '@/components/admin/section-gate';
import {
  emitManualInvoice,
  type ManualInvoiceInput,
  type ManualPaymentMethod,
} from '@/actions/invoices';

const PAYMENT_OPTIONS: { value: ManualPaymentMethod; label: string }[] = [
  { value: 'PIX', label: 'Pix' },
  { value: 'CASH', label: 'Dinheiro' },
  { value: 'CREDIT_CARD', label: 'Cartão de crédito' },
  { value: 'DEBIT_CARD', label: 'Cartão de débito' },
  { value: 'BOLETO', label: 'Boleto' },
  { value: 'OTHER', label: 'Outro' },
];

interface ItemRow {
  description: string;
  ncm: string;
  quantity: string;
  unitPrice: string;
}

const EMPTY_ITEM: ItemRow = { description: '', ncm: '', quantity: '1', unitPrice: '' };

const inputCls =
  'h-9 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

function parseMoney(v: string): number {
  const n = Number(v.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

function fmt(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDocument(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return d
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export default function NotaAvulsaPageRoot() {
  return (
    <SectionGate section="FINANCEIRO">
      <NotaAvulsaPage />
    </SectionGate>
  );
}

function NotaAvulsaPage() {
  const { token } = useAuth();
  const router = useRouter();

  const [name, setName] = useState('');
  const [document, setDocument] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState({
    cep: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
  });
  const [items, setItems] = useState<ItemRow[]>([{ ...EMPTY_ITEM }]);
  const [paymentMethod, setPaymentMethod] = useState<ManualPaymentMethod>('PIX');
  const [inPerson, setInPerson] = useState(false);
  const [additionalInfo, setAdditionalInfo] = useState('');
  const [cepLoading, setCepLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const itemTotals = items.map((i) => {
    const q = parseMoney(i.quantity);
    const p = parseMoney(i.unitPrice);
    return Number.isFinite(q) && Number.isFinite(p) ? Math.round(q * p * 100) / 100 : 0;
  });
  const total = itemTotals.reduce((s, t) => s + t, 0);

  function setAddr(field: keyof typeof address, value: string) {
    setAddress((prev) => ({ ...prev, [field]: value }));
  }

  function setItem(idx: number, field: keyof ItemRow, value: string) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  }

  async function lookupCep(cep: string) {
    const cleaned = cep.replace(/\D/g, '');
    if (cleaned.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cleaned}/json/`, {
        signal: AbortSignal.timeout(5000),
      });
      const data = await res.json();
      if (!data.erro) {
        setAddress((prev) => ({
          ...prev,
          street: data.logradouro || prev.street,
          neighborhood: data.bairro || prev.neighborhood,
          city: data.localidade || prev.city,
          state: data.uf || prev.state,
        }));
      }
    } catch {
      // Sem autopreenchimento: o operador digita o endereço.
    } finally {
      setCepLoading(false);
    }
  }

  function buildInput(): ManualInvoiceInput | string {
    const doc = document.replace(/\D/g, '');
    if (doc.length !== 11 && doc.length !== 14) return 'Informe um CPF (11 dígitos) ou CNPJ (14).';
    const parsed = items.map((i) => ({
      description: i.description.trim(),
      ncm: i.ncm.replace(/\D/g, '') || undefined,
      quantity: parseMoney(i.quantity),
      unitPrice: parseMoney(i.unitPrice),
    }));
    for (let n = 0; n < parsed.length; n++) {
      const i = parsed[n];
      if (!i.description) return `Item ${n + 1}: informe a descrição.`;
      if (i.ncm && i.ncm.length !== 8) return `Item ${n + 1}: o NCM deve ter 8 dígitos.`;
      if (!(i.quantity > 0)) return `Item ${n + 1}: quantidade inválida.`;
      if (!(i.unitPrice > 0)) return `Item ${n + 1}: valor unitário inválido.`;
    }
    return {
      buyer: {
        name: name.trim(),
        document: doc,
        ...(email.trim() ? { email: email.trim() } : {}),
        address: {
          ...address,
          cep: address.cep.replace(/\D/g, ''),
          complement: address.complement.trim() || undefined,
          state: address.state.trim().toUpperCase(),
        },
      },
      items: parsed,
      paymentMethod,
      inPerson,
      ...(additionalInfo.trim() ? { additionalInfo: additionalInfo.trim() } : {}),
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const input = buildInput();
    if (typeof input === 'string') {
      setError(input);
      return;
    }
    const summary =
      `Emitir NF-e de ${fmt(total)} para ${input.buyer.name} (${formatDocument(input.buyer.document)})?\n\n` +
      input.items.map((i) => `• ${i.quantity} × ${i.description}`).join('\n') +
      '\n\nA nota tem valor fiscal e só pode ser cancelada em até 24h.';
    if (!window.confirm(summary)) return;

    setSubmitting(true);
    try {
      const invoice = await emitManualInvoice(token!, input);
      router.push(`/admin/financeiro/notas-fiscais/${invoice.id}`);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/admin/financeiro/notas-fiscais"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>
        <div>
          <h1 className="text-xl font-bold">Emitir nota avulsa</h1>
          <p className="text-sm text-muted-foreground">
            NF-e para uma venda feita fora do site, emitida pela Focus NFe.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <section className="space-y-3 rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold">Comprador</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome / razão social">
              <input
                required
                minLength={2}
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="CPF ou CNPJ">
              <input
                required
                inputMode="numeric"
                value={document}
                onChange={(e) => setDocument(formatDocument(e.target.value))}
                placeholder="000.000.000-00"
                className={inputCls}
              />
            </Field>
            <Field label="E-mail (opcional, recebe a DANFE)">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label={cepLoading ? 'CEP (buscando…)' : 'CEP'}>
              <input
                required
                inputMode="numeric"
                maxLength={9}
                value={address.cep}
                onChange={(e) => setAddr('cep', e.target.value)}
                onBlur={(e) => lookupCep(e.target.value)}
                placeholder="00000-000"
                className={inputCls}
              />
            </Field>
            <Field label="Rua">
              <input
                required
                value={address.street}
                onChange={(e) => setAddr('street', e.target.value)}
                className={inputCls}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Número">
                <input
                  required
                  value={address.number}
                  onChange={(e) => setAddr('number', e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Complemento">
                <input
                  value={address.complement}
                  onChange={(e) => setAddr('complement', e.target.value)}
                  className={inputCls}
                />
              </Field>
            </div>
            <Field label="Bairro">
              <input
                required
                value={address.neighborhood}
                onChange={(e) => setAddr('neighborhood', e.target.value)}
                className={inputCls}
              />
            </Field>
            <div className="grid grid-cols-[1fr_80px] gap-3">
              <Field label="Cidade">
                <input
                  required
                  value={address.city}
                  onChange={(e) => setAddr('city', e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="UF">
                <input
                  required
                  maxLength={2}
                  value={address.state}
                  onChange={(e) => setAddr('state', e.target.value.toUpperCase())}
                  className={inputCls}
                />
              </Field>
            </div>
          </div>
        </section>

        <section className="space-y-3 rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Produtos</h2>
            <button
              type="button"
              onClick={() => setItems((prev) => [...prev, { ...EMPTY_ITEM }])}
              className="flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs hover:bg-muted"
            >
              <Plus className="h-3.5 w-3.5" /> Adicionar produto
            </button>
          </div>
          {items.map((item, idx) => (
            <div
              key={idx}
              className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_110px_70px_110px_auto] sm:items-end"
            >
              <Field label="Descrição">
                <input
                  required
                  maxLength={120}
                  value={item.description}
                  onChange={(e) => setItem(idx, 'description', e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="NCM (opcional)">
                <input
                  inputMode="numeric"
                  maxLength={10}
                  value={item.ncm}
                  onChange={(e) => setItem(idx, 'ncm', e.target.value)}
                  placeholder="8 dígitos"
                  className={inputCls}
                />
              </Field>
              <Field label="Qtd">
                <input
                  required
                  inputMode="decimal"
                  value={item.quantity}
                  onChange={(e) => setItem(idx, 'quantity', e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Valor unit. (R$)">
                <input
                  required
                  inputMode="decimal"
                  value={item.unitPrice}
                  onChange={(e) => setItem(idx, 'unitPrice', e.target.value)}
                  placeholder="0,00"
                  className={inputCls}
                />
              </Field>
              <button
                type="button"
                disabled={items.length === 1}
                onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                aria-label={`Remover produto ${idx + 1}`}
                className="flex h-9 items-center justify-center rounded-lg border px-2.5 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Sem NCM, a nota usa o NCM padrão configurado para a loja.
          </p>
        </section>

        <section className="space-y-3 rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold">Pagamento</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Forma de pagamento">
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as ManualPaymentMethod)}
                className={inputCls}
              >
                {PAYMENT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input
                type="checkbox"
                checked={inPerson}
                onChange={(e) => setInPerson(e.target.checked)}
                className="accent-primary"
              />
              Venda presencial (cliente na loja)
            </label>
          </div>
          <Field label="Informações adicionais (opcional)">
            <textarea
              maxLength={500}
              rows={2}
              value={additionalInfo}
              onChange={(e) => setAdditionalInfo(e.target.value)}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </Field>
        </section>

        {error && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between rounded-xl border bg-card p-4">
          <div>
            <p className="text-xs text-muted-foreground">Total da nota</p>
            <p className="text-lg font-bold">{fmt(total)}</p>
          </div>
          <button
            type="submit"
            disabled={submitting || total <= 0}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {submitting ? 'Emitindo…' : 'Emitir NF-e'}
          </button>
        </div>
      </form>
    </div>
  );
}
