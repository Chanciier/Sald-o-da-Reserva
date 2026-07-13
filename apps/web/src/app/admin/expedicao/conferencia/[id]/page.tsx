'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  FileText,
  Tag,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Truck,
  Phone,
  MessageCircle,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { getOrder } from '@/lib/cart-api';
import { fetchInvoices, emitInvoice, reemitInvoice } from '@/actions/invoices';
import { purchaseLabel } from '@/lib/shipping';
import { marcarPronto, confirmarRetirada, cancelarPedido } from '@/actions/expedicao';
import type { Order } from '@/types/order';
import type { Invoice } from '@/actions/invoices';
import type { ShippingOption } from '@/types/cart';

const API = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/v1`;

const STATUS_LABEL: Record<string, string> = {
  PAID: 'Pago',
  SEPARATING: 'Em Separação',
  SEPARATED: 'Separado',
  READY_TO_SHIP: 'Pronto p/ Envio',
  SHIPPED: 'Enviado',
  DELIVERED: 'Entregue',
  CANCELLED: 'Cancelado',
  PENDING: 'Pendente',
  CONFIRMED: 'Confirmado',
};

const STATUS_COLOR: Record<string, string> = {
  PAID: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  SEPARATING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  SEPARATED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  READY_TO_SHIP: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  SHIPPED: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  DELIVERED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
};

function fmt(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatPhone(d: string | null | undefined) {
  if (!d) return '—';
  const c = d.replace(/\D/g, '');
  if (c.length === 11) return `(${c.slice(0, 2)}) ${c.slice(2, 7)}-${c.slice(7)}`;
  if (c.length === 10) return `(${c.slice(0, 2)}) ${c.slice(2, 6)}-${c.slice(6)}`;
  return d;
}

function waLink(d: string | null | undefined) {
  if (!d) return null;
  const c = d.replace(/\D/g, '');
  if (c.length < 10) return null;
  return `https://wa.me/55${c}`;
}

async function patchStatus(token: string, orderId: string, status: string) {
  const res = await fetch(`${API}/orders/admin/${orderId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { message?: string }).message ?? `Erro ${res.status}`);
  return data;
}

export default function ConferenciaPage({ params }: { params: { id: string } }) {
  const { token } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [labelError, setLabelError] = useState('');
  const [invoiceError, setInvoiceError] = useState('');
  const [buyerCpf, setBuyerCpf] = useState('');
  const [buyerNameOverride, setBuyerNameOverride] = useState('');
  const [danfePending, setDanfePending] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [refundWarning, setRefundWarning] = useState('');
  const [carrierModal, setCarrierModal] = useState(false);
  const [carrierOptions, setCarrierOptions] = useState<ShippingOption[]>([]);
  const [carrierLoading, setCarrierLoading] = useState(false);
  const [selectedCarrier, setSelectedCarrier] = useState<ShippingOption | null>(null);
  const [carrierError, setCarrierError] = useState('');

  const { data: order, isLoading: orderLoading } = useQuery<Order>({
    queryKey: ['order', params.id],
    queryFn: () => getOrder(token!, params.id),
    enabled: !!token,
  });

  const {
    data: invoicesData,
    isLoading: invoiceLoading,
    refetch: refetchInvoice,
  } = useQuery({
    queryKey: ['invoice-order', params.id],
    queryFn: () => fetchInvoices(token!, { orderId: params.id, limit: '1' }),
    enabled: !!token,
  });

  const invoice: Invoice | undefined = invoicesData?.data?.[0];

  const emitMutation = useMutation({
    mutationFn: () =>
      emitInvoice(token!, params.id, {
        cpf: buyerCpf.replace(/\D/g, '') || undefined,
        name: buyerNameOverride.trim() || undefined,
      }),
    onSuccess: () => {
      setInvoiceError('');
      refetchInvoice();
    },
    onError: (e: Error) => setInvoiceError(e.message),
  });

  const reemitMutation = useMutation({
    mutationFn: () =>
      reemitInvoice(token!, invoice!.id, {
        cpf: buyerCpf.replace(/\D/g, '') || undefined,
        name: buyerNameOverride.trim() || undefined,
      }),
    onSuccess: () => {
      setInvoiceError('');
      refetchInvoice();
    },
    onError: (e: Error) => setInvoiceError(e.message),
  });

  const API_BASE = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/v1`;

  async function openDanfe() {
    setInvoiceError('');
    setDanfePending(true);
    try {
      const res = await fetch(`${API_BASE}/invoices/${invoice!.id}/danfe`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { message?: string }).message ?? `Erro HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setInvoiceError(e instanceof Error ? e.message : 'Erro ao baixar DANFE');
    } finally {
      setDanfePending(false);
    }
  }

  async function openXml() {
    setInvoiceError('');
    setDanfePending(true);
    try {
      const res = await fetch(`${API_BASE}/invoices/${invoice!.id}/xml/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { message?: string }).message ?? `Erro HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'nfe.xml';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setInvoiceError(e instanceof Error ? e.message : 'Erro ao baixar XML');
    } finally {
      setDanfePending(false);
    }
  }

  const labelMutation = useMutation({
    mutationFn: () => purchaseLabel(params.id, token!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['order', params.id] }),
    onError: (e: Error) => setLabelError(e.message),
  });

  async function openCarrierModal() {
    setCarrierError('');
    setCarrierOptions([]);
    setSelectedCarrier(null);
    setCarrierModal(true);
    setCarrierLoading(true);
    try {
      const cep = order?.shippingAddress?.cep?.replace(/\D/g, '');
      if (!cep) throw new Error('CEP não disponível para cotação.');
      const res = await fetch(`${API}/shipping/quote?cep=${cep}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { message?: string }).message ?? `Erro ${res.status}`);
      const opts = data as ShippingOption[];
      setCarrierOptions(opts);
      if (opts.length) setSelectedCarrier(opts[0]);
    } catch (e) {
      setCarrierError(e instanceof Error ? e.message : 'Erro ao buscar cotações.');
    } finally {
      setCarrierLoading(false);
    }
  }

  const updateCarrierMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCarrier) throw new Error('Selecione uma transportadora.');
      const res = await fetch(`${API}/shipping/${params.id}/carrier`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          serviceId: selectedCarrier.serviceId,
          carrier: selectedCarrier.carrier,
          service: selectedCarrier.name,
          price: selectedCarrier.price,
          deliveryMin: selectedCarrier.deliveryMin,
          deliveryMax: selectedCarrier.deliveryMax,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { message?: string }).message ?? `Erro ${res.status}`);
      return data;
    },
    onSuccess: () => {
      setCarrierModal(false);
      qc.invalidateQueries({ queryKey: ['order', params.id] });
    },
    onError: (e: Error) => setCarrierError(e.message),
  });

  const marcarMutation = useMutation({
    mutationFn: () => marcarPronto(token!, params.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['order', params.id] }),
  });

  const confirmarEnvioMutation = useMutation({
    mutationFn: () => patchStatus(token!, params.id, 'SHIPPED'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', params.id] });
      router.push('/admin/expedicao/enviados');
    },
  });

  const confirmarRetiradaMutation = useMutation({
    mutationFn: () => confirmarRetirada(token!, params.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', params.id] });
      router.push('/admin/expedicao/concluidos');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelarPedido(token!, params.id),
    onSuccess: (result) => {
      if (!result.ok) {
        setCancelError(result.error);
        return;
      }
      if (result.refundError) {
        setRefundWarning(result.refundError);
        setConfirmCancel(false);
        qc.invalidateQueries({ queryKey: ['order', params.id] });
        return;
      }
      router.push('/admin/expedicao/fila');
    },
  });

  if (orderLoading || !order) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const isPickup = (order as Order & { deliveryMethod?: string }).deliveryMethod === 'PICKUP';
  const pickupCode = (order as Order & { pickupCode?: string | null }).pickupCode;
  const shipment = order.shipment;
  const status = order.status;
  const customerPhone = (order as Order & { customerPhone?: string | null }).customerPhone ?? null;
  const buyerName = (order as Order & { buyerName?: string | null }).buyerName ?? null;
  const wa = waLink(customerPhone);

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3 flex-wrap">
        <Link
          href="/admin/expedicao/prontos"
          className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar
        </Link>
        <h1 className="text-xl font-bold">Conferência — #{params.id.slice(-8).toUpperCase()}</h1>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[status] ?? 'bg-muted text-foreground'}`}
        >
          {STATUS_LABEL[status] ?? status}
        </span>
        {order.clientConfirmedPickupAt && (
          <span className="inline-flex items-center rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-800 dark:bg-teal-900/30 dark:text-teal-300">
            Cliente informou que já retirou
          </span>
        )}
      </div>

      {/* Contato do cliente */}
      <section className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="border-b px-4 py-3 flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold text-sm">Contato do Cliente</h2>
        </div>
        <div className="p-4 flex items-start justify-between gap-3">
          <div>
            <p className="font-medium">{buyerName ?? order.shippingAddress?.name ?? '—'}</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Phone className="h-3.5 w-3.5" />
              {formatPhone(customerPhone)}
            </p>
          </div>
          {wa && (
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
            >
              <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
            </a>
          )}
        </div>
      </section>

      {/* 1. Resumo do Pedido */}
      <section className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="border-b px-4 py-3 flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold text-sm">Resumo do Pedido</h2>
        </div>
        <div className="p-4 space-y-3">
          <div className="space-y-2">
            {order.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between text-sm">
                <div>
                  <span className="font-medium">{item.name}</span>
                  <span className="text-muted-foreground ml-2">× {item.quantity}</span>
                  <span className="text-xs text-muted-foreground ml-2">SKU: {item.sku}</span>
                </div>
                <span>{fmt(item.subtotal)}</span>
              </div>
            ))}
          </div>
          <div className="border-t pt-3 space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>{fmt(order.subtotal)}</span>
            </div>
            {order.discount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Desconto</span>
                <span>-{fmt(order.discount)}</span>
              </div>
            )}
            {order.shipping > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Frete</span>
                <span>{fmt(order.shipping)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base border-t pt-2 mt-1">
              <span>Total</span>
              <span>{fmt(order.total)}</span>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Nota Fiscal */}
      <section className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="border-b px-4 py-3 flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold text-sm">Nota Fiscal (NF-e)</h2>
        </div>
        <div className="p-4 space-y-3">
          {invoiceError && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive flex items-center justify-between gap-2">
              <span>Erro: {invoiceError}</span>
              <button
                onClick={() => setInvoiceError('')}
                className="shrink-0 opacity-70 hover:opacity-100"
              >
                ✕
              </button>
            </div>
          )}
          {invoiceLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Verificando NF-e...
            </div>
          ) : !invoice || invoice.status === 'PENDING' ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Nenhuma NF-e emitida.</p>
              <p className="text-xs text-muted-foreground">
                CPF/nome do comprador (opcional — use para pedidos de marketplace, onde o cadastro
                não tem CPF, ex.: Mercado Livre)
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="CPF do comprador"
                  value={buyerCpf}
                  onChange={(e) => setBuyerCpf(e.target.value)}
                  className="h-9 w-40 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <input
                  type="text"
                  placeholder="Nome completo (opcional)"
                  value={buyerNameOverride}
                  onChange={(e) => setBuyerNameOverride(e.target.value)}
                  className="h-9 w-56 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  onClick={() => emitMutation.mutate()}
                  disabled={emitMutation.isPending}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {emitMutation.isPending ? (
                    <span className="flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> Emitindo...
                    </span>
                  ) : (
                    'Emitir NF-e'
                  )}
                </button>
              </div>
            </div>
          ) : invoice.status === 'PROCESSING' ? (
            <div className="flex items-center gap-2 text-sm text-yellow-700 dark:text-yellow-300">
              <Loader2 className="h-4 w-4 animate-spin" /> Processando NF-e...
            </div>
          ) : invoice.status === 'AUTHORIZED' ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-300">
                  Autorizada
                </span>
                {invoice.invoiceNumber && (
                  <span className="text-xs text-muted-foreground">
                    NF-e #{invoice.invoiceNumber}
                  </span>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={openDanfe}
                  disabled={danfePending}
                  className="rounded-lg border px-3 py-1.5 text-xs hover:bg-muted transition-colors disabled:opacity-50"
                >
                  {danfePending ? 'Buscando...' : 'Imprimir DANFE'}
                </button>
                <button
                  onClick={openXml}
                  disabled={danfePending}
                  className="rounded-lg border px-3 py-1.5 text-xs hover:bg-muted transition-colors disabled:opacity-50"
                >
                  Baixar XML
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">
                  {invoice.status === 'REJECTED' ? 'Rejeitada' : 'Cancelada'}
                </span>
                {invoice.errorMessage && (
                  <span className="text-xs text-muted-foreground">— {invoice.errorMessage}</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                CPF/nome do comprador (obrigatório se o pedido não tiver CPF cadastrado, ex.:
                Mercado Livre)
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="CPF do comprador"
                  value={buyerCpf}
                  onChange={(e) => setBuyerCpf(e.target.value)}
                  className="h-9 w-40 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <input
                  type="text"
                  placeholder="Nome completo (opcional)"
                  value={buyerNameOverride}
                  onChange={(e) => setBuyerNameOverride(e.target.value)}
                  className="h-9 w-56 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  onClick={() => reemitMutation.mutate()}
                  disabled={reemitMutation.isPending}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {reemitMutation.isPending ? 'Reemitindo...' : 'Reemitir NF-e'}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 3. Etiqueta de Envio */}
      {!isPickup ? (
        <section className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="border-b px-4 py-3 flex items-center gap-2">
            <Tag className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm">Etiqueta de Envio</h2>
          </div>
          <div className="p-4">
            {!shipment || !shipment.labelUrl ? (
              <div className="flex items-center gap-3 flex-wrap">
                <p className="text-sm text-muted-foreground">Sem etiqueta gerada.</p>
                {shipment?.serviceId ? (
                  <>
                    <button
                      onClick={() => {
                        setLabelError('');
                        labelMutation.mutate();
                      }}
                      disabled={labelMutation.isPending}
                      className="rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    >
                      {labelMutation.isPending ? 'Gerando...' : 'Gerar Etiqueta'}
                    </button>
                    {shipment.status === 'PENDING' && (
                      <button
                        onClick={openCarrierModal}
                        className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs hover:bg-muted transition-colors"
                      >
                        <Truck className="h-3 w-3" /> Trocar
                      </button>
                    )}
                    {labelError && <span className="text-xs text-red-500">{labelError}</span>}
                  </>
                ) : shipment?.service === 'FREE' || order.shipping === 0 ? (
                  <span className="text-xs text-muted-foreground">
                    Frete grátis — sem etiqueta necessária.
                  </span>
                ) : shipment ? (
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-xs text-amber-600 dark:text-amber-400">
                      Pedido sem integração ME — gere a etiqueta manualmente no site da
                      transportadora.
                    </span>
                    <button
                      onClick={openCarrierModal}
                      className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs hover:bg-muted transition-colors"
                    >
                      <Truck className="h-3 w-3" /> Trocar Transportadora
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{shipment.carrier}</span>
                  {shipment.trackingCode && (
                    <span className="ml-2 font-mono text-xs">{shipment.trackingCode}</span>
                  )}
                </div>
                <button
                  onClick={() => window.open(shipment.labelUrl!, '_blank')}
                  className="rounded-lg border px-3 py-1.5 text-xs hover:bg-muted transition-colors"
                >
                  Imprimir Etiqueta
                </button>
              </div>
            )}
          </div>
        </section>
      ) : (
        <section className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="border-b px-4 py-3 flex items-center gap-2">
            <Tag className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm">Etiqueta de Retirada</h2>
          </div>
          <div className="p-4 flex items-center gap-4">
            {pickupCode && (
              <span className="font-mono text-lg font-bold tracking-widest border rounded-lg px-3 py-1.5 bg-muted">
                {pickupCode}
              </span>
            )}
            <Link
              href={`/admin/expedicao/retirada/${params.id}/etiqueta`}
              target="_blank"
              className="rounded-lg border px-3 py-1.5 text-xs hover:bg-muted transition-colors"
            >
              Imprimir Etiqueta Interna
            </Link>
          </div>
        </section>
      )}

      {/* 3b. Destinatário (sempre visível para envios) */}
      {!isPickup && order.shippingAddress && (
        <section className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="border-b px-4 py-3">
            <h2 className="font-semibold text-sm">Destinatário</h2>
          </div>
          <div className="p-4 text-sm space-y-0.5">
            <p className="font-medium">{order.shippingAddress.name}</p>
            <p className="text-muted-foreground">
              {order.shippingAddress.street}, {order.shippingAddress.number}
              {order.shippingAddress.complement ? ` — ${order.shippingAddress.complement}` : ''}
            </p>
            <p className="text-muted-foreground">
              {order.shippingAddress.neighborhood} · {order.shippingAddress.city}/
              {order.shippingAddress.state}
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              CEP {order.shippingAddress.cep}
            </p>
            {shipment && (
              <p className="pt-1 text-xs text-muted-foreground">
                Transportadora:{' '}
                <span className="font-medium text-foreground">
                  {shipment.carrier || 'Frete Grátis'}{' '}
                  {shipment.service && shipment.service !== 'FREE' ? `— ${shipment.service}` : ''}
                </span>
              </p>
            )}
          </div>
        </section>
      )}

      {/* 4. Ações Finais */}
      <section className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="border-b px-4 py-3">
          <h2 className="font-semibold text-sm">Ações Finais</h2>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex flex-wrap gap-3">
            {status !== 'READY_TO_SHIP' &&
              status !== 'SHIPPED' &&
              status !== 'DELIVERED' &&
              status !== 'CANCELLED' && (
                <button
                  onClick={() => marcarMutation.mutate()}
                  disabled={marcarMutation.isPending}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {marcarMutation.isPending ? 'Marcando...' : 'Marcar como Pronto'}
                </button>
              )}

            {!isPickup && (status === 'READY_TO_SHIP' || status === 'SEPARATED') && (
              <button
                onClick={() => confirmarEnvioMutation.mutate()}
                disabled={confirmarEnvioMutation.isPending}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {confirmarEnvioMutation.isPending ? 'Confirmando...' : 'Confirmar Envio'}
              </button>
            )}

            {isPickup && status !== 'DELIVERED' && status !== 'CANCELLED' && (
              <button
                onClick={() => confirmarRetiradaMutation.mutate()}
                disabled={confirmarRetiradaMutation.isPending}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {confirmarRetiradaMutation.isPending ? 'Confirmando...' : 'Confirmar Retirada'}
              </button>
            )}
          </div>

          {refundWarning && (
            <div className="rounded-lg border border-yellow-400/60 bg-yellow-50 dark:bg-yellow-900/20 px-4 py-3 text-sm text-yellow-800 dark:text-yellow-300">
              Pedido cancelado, mas o estorno automático falhou: {refundWarning}. Realize o estorno
              manualmente no Mercado Pago.
            </div>
          )}

          {status !== 'SHIPPED' && status !== 'CANCELLED' && (
            <>
              {cancelError && <p className="text-xs text-destructive">{cancelError}</p>}
              {confirmCancel ? (
                <div className="flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3">
                  <span className="text-sm text-destructive font-medium">
                    Cancelar este pedido?
                  </span>
                  <button
                    onClick={() => cancelMutation.mutate()}
                    disabled={cancelMutation.isPending}
                    className="rounded-lg bg-destructive px-3 py-1.5 text-xs text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {cancelMutation.isPending ? 'Cancelando...' : 'Confirmar Cancelamento'}
                  </button>
                  <button
                    onClick={() => setConfirmCancel(false)}
                    className="rounded-lg border px-3 py-1.5 text-xs hover:bg-muted"
                  >
                    Voltar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmCancel(true)}
                  className="rounded-lg border border-destructive/50 px-4 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                >
                  Cancelar Pedido
                </button>
              )}
            </>
          )}
        </div>
      </section>
      {carrierModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border bg-background p-6 shadow-xl">
            <h2 className="text-base font-semibold mb-4">Trocar Transportadora</h2>
            {carrierLoading ? (
              <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Buscando cotações...
              </div>
            ) : carrierError ? (
              <p className="text-sm text-destructive py-2">{carrierError}</p>
            ) : carrierOptions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                Nenhuma transportadora disponível para este CEP.
              </p>
            ) : (
              <div className="space-y-2 mb-4">
                {carrierOptions.map((opt) => (
                  <label
                    key={opt.serviceId}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 hover:bg-muted transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                  >
                    <input
                      type="radio"
                      name="carrier"
                      checked={selectedCarrier?.serviceId === opt.serviceId}
                      onChange={() => setSelectedCarrier(opt)}
                      className="accent-primary"
                    />
                    <div className="flex-1 text-sm">
                      <span className="font-medium">{opt.carrier}</span>
                      <span className="text-muted-foreground ml-1">— {opt.name}</span>
                    </div>
                    <div className="text-right text-xs">
                      <div className="font-medium">
                        {opt.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </div>
                      <div className="text-muted-foreground">{opt.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setCarrierModal(false)}
                className="rounded-lg border px-4 py-2 text-sm hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => updateCarrierMutation.mutate()}
                disabled={!selectedCarrier || updateCarrierMutation.isPending || carrierLoading}
                className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {updateCarrierMutation.isPending ? 'Salvando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
