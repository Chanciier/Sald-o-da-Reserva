'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { fetchInvoice, type Invoice } from '@/actions/invoices';

function fmt(n: number | string | null | undefined) {
  return Number(n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(s: string | null | undefined) {
  if (!s) return '—';
  return new Date(s).toLocaleString('pt-BR');
}

export default function ImprimirDanfePage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetchInvoice(token, id)
      .then(setInvoice)
      .finally(() => setLoading(false));
  }, [token, id]);

  useEffect(() => {
    if (!loading && invoice) {
      setTimeout(() => window.print(), 300);
    }
  }, [loading, invoice]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Carregando nota fiscal...</p>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-destructive">Nota não encontrada.</p>
      </div>
    );
  }

  const order = invoice.order;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ord = order as any;
  const address = ord.shippingAddress as
    | {
        street?: string;
        number?: string;
        neighborhood?: string;
        city?: string;
        state?: string;
        cep?: string;
      }
    | undefined;

  const total = Number(ord.total ?? 0);
  const discount = Number(ord.discount ?? 0);
  const shipping = Number(ord.shipping ?? 0);
  const subtotal = total + discount - shipping;

  const emitterName = 'SALDÃO DA REVERSA SJC LTDA';
  const emitterCnpj = '';

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; background: white; }
        }
        body { font-family: Arial, sans-serif; font-size: 10px; background: #f5f5f5; }
        .danfe { width: 210mm; min-height: 297mm; margin: 0 auto; background: white; padding: 8mm; box-sizing: border-box; }
        table { border-collapse: collapse; width: 100%; }
        td, th { border: 1px solid #333; padding: 2px 4px; vertical-align: top; }
        .label { font-size: 7px; color: #555; display: block; }
        .val { font-size: 10px; font-weight: bold; }
        .title-box { background: #eee; font-weight: bold; font-size: 9px; padding: 2px 4px; text-align: center; letter-spacing: 1px; }
        .header-company { font-size: 13px; font-weight: bold; text-align: center; }
        .section-title { background: #333; color: white; font-weight: bold; font-size: 8px; padding: 2px 4px; text-transform: uppercase; letter-spacing: 1px; }
      `}</style>

      <div className="danfe">
        {/* Print / close buttons */}
        <div className="no-print mb-4 flex gap-3">
          <button
            onClick={() => window.print()}
            className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90"
          >
            Imprimir
          </button>
          <button
            onClick={() => window.close()}
            className="rounded-lg border px-4 py-2 text-sm hover:bg-muted"
          >
            Fechar
          </button>
        </div>

        {/* ── RECIBO DO DESTINATÁRIO ── */}
        <table style={{ marginBottom: 4 }}>
          <tbody>
            <tr>
              <td colSpan={3} style={{ fontSize: 7, borderBottom: 'none' }}>
                RECIBO DO DESTINATÁRIO — Recebemos de {emitterName} os produtos / serviços
                constantes na Nota Fiscal indicada ao lado.
              </td>
              <td style={{ width: 100, textAlign: 'center' }}>
                <span className="label">VALOR DA NOTA</span>
                <span className="val">R$ {total.toFixed(2).replace('.', ',')}</span>
              </td>
              <td rowSpan={2} style={{ width: 120, textAlign: 'center' }}>
                <span className="label">NF-e</span>
                <div style={{ fontSize: 16, fontWeight: 'bold' }}>
                  N° {invoice.invoiceNumber ?? '—'}
                </div>
                <div style={{ fontSize: 9 }}>SÉRIE: 1</div>
              </td>
            </tr>
            <tr>
              <td style={{ width: 100 }}>
                <span className="label">DATA DE RECEBIMENTO</span>
                <span className="val">&nbsp;</span>
              </td>
              <td colSpan={2}>
                <span className="label">IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR</span>
                <span className="val">&nbsp;</span>
              </td>
              <td>
                <span className="label">DESTINATÁRIO</span>
                <span className="val">{order.user.name ?? order.user.email}</span>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Dashed separator */}
        <div style={{ borderTop: '2px dashed #333', margin: '4px 0' }} />

        {/* ── HEADER ── */}
        <table style={{ marginBottom: 2 }}>
          <tbody>
            <tr>
              <td style={{ width: 220, textAlign: 'center', padding: 4 }}>
                <div className="header-company">{emitterName}</div>
                {emitterCnpj && <div style={{ fontSize: 9 }}>CNPJ: {emitterCnpj}</div>}
                <div style={{ fontSize: 9, marginTop: 4 }}>SÃO JOSÉ DOS CAMPOS / SP</div>
              </td>
              <td style={{ textAlign: 'center', padding: 4 }}>
                <div style={{ fontSize: 14, fontWeight: 'bold', letterSpacing: 2 }}>DANFE</div>
                <div style={{ fontSize: 8 }}>DOCUMENTO AUXILIAR DA</div>
                <div style={{ fontSize: 8 }}>NOTA FISCAL ELETRÔNICA</div>
                <div style={{ fontSize: 9, marginTop: 4 }}>
                  0 - Entrada &nbsp; 1 - Saída &nbsp;
                  <span
                    style={{
                      border: '1px solid #333',
                      padding: '0 4px',
                      fontSize: 11,
                      fontWeight: 'bold',
                    }}
                  >
                    1
                  </span>
                </div>
              </td>
              <td style={{ width: 200, padding: 4 }}>
                <div style={{ fontSize: 8, fontWeight: 'bold', marginBottom: 2 }}>
                  N° {invoice.invoiceNumber ?? '—'}
                </div>
                <div style={{ fontSize: 8 }}>SÉRIE: 1</div>
                <div style={{ fontSize: 8 }}>FOLHA: 1 de 1</div>
              </td>
            </tr>
            <tr>
              <td colSpan={3} style={{ padding: '2px 4px' }}>
                <span className="label">CHAVE DE ACESSO</span>
                <div
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 10,
                    letterSpacing: 1,
                    fontWeight: 'bold',
                  }}
                >
                  {invoice.accessKey ? invoice.accessKey.replace(/(.{4})/g, '$1 ').trim() : '—'}
                </div>
              </td>
            </tr>
            <tr>
              <td colSpan={3} style={{ fontSize: 8 }}>
                Consulte a autenticidade no portal nacional da NF-e www.nfe.fazenda.gov.br/portal
              </td>
            </tr>
          </tbody>
        </table>

        {/* ── NATUREZA DA OPERAÇÃO ── */}
        <table style={{ marginBottom: 2 }}>
          <tbody>
            <tr>
              <td style={{ width: '60%' }}>
                <span className="label">NATUREZA DA OPERAÇÃO</span>
                <span className="val">Venda de mercadoria</span>
              </td>
              <td>
                <span className="label">PROTOCOLO DE AUTORIZAÇÃO DE USO</span>
                <span className="val">{invoice.protocol ?? '—'}</span>
              </td>
            </tr>
          </tbody>
        </table>

        {/* ── DESTINATÁRIO ── */}
        <div className="section-title">Destinatário / Remetente</div>
        <table style={{ marginBottom: 2 }}>
          <tbody>
            <tr>
              <td style={{ width: '50%' }}>
                <span className="label">NOME / RAZÃO SOCIAL</span>
                <span className="val">{order.user.name ?? '—'}</span>
              </td>
              <td>
                <span className="label">E-MAIL</span>
                <span className="val">{order.user.email}</span>
              </td>
              <td style={{ width: 100 }}>
                <span className="label">DATA DA EMISSÃO</span>
                <span className="val">{fmtDate(invoice.issueDate)}</span>
              </td>
            </tr>
            {address && (
              <tr>
                <td colSpan={2}>
                  <span className="label">ENDEREÇO</span>
                  <span className="val">
                    {address.street}
                    {address.number ? `, ${address.number}` : ''} — {address.neighborhood}
                  </span>
                </td>
                <td>
                  <span className="label">CEP</span>
                  <span className="val">{address.cep ?? '—'}</span>
                </td>
              </tr>
            )}
            {address && (
              <tr>
                <td>
                  <span className="label">MUNICÍPIO</span>
                  <span className="val">{address.city ?? '—'}</span>
                </td>
                <td>
                  <span className="label">UF</span>
                  <span className="val">{address.state ?? '—'}</span>
                </td>
                <td />
              </tr>
            )}
          </tbody>
        </table>

        {/* ── DADOS DO PRODUTO / SERVIÇO ── */}
        <div className="section-title">Dados do Produto / Serviço</div>
        <table style={{ marginBottom: 2, fontSize: 9 }}>
          <thead>
            <tr style={{ background: '#eee' }}>
              <th style={{ width: 40 }}>CÓD.</th>
              <th>DESCRIÇÃO DO PRODUTO / SERVIÇO</th>
              <th style={{ width: 40 }}>CFOP</th>
              <th style={{ width: 30 }}>UN</th>
              <th style={{ width: 40 }}>QTDE</th>
              <th style={{ width: 70 }}>VALOR UNIT.</th>
              <th style={{ width: 70 }}>VALOR TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item, i) => (
              <tr key={i}>
                <td style={{ textAlign: 'center' }}>{item.sku}</td>
                <td>{item.name}</td>
                <td style={{ textAlign: 'center' }}>5102</td>
                <td style={{ textAlign: 'center' }}>UN</td>
                <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                <td style={{ textAlign: 'right' }}>{fmt(item.price)}</td>
                <td style={{ textAlign: 'right' }}>{fmt(item.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ── CÁLCULO DO IMPOSTO (simplificado) ── */}
        <div className="section-title">Cálculo do Imposto</div>
        <table style={{ marginBottom: 2 }}>
          <tbody>
            <tr>
              <td>
                <span className="label">VALOR DOS PRODUTOS</span>
                <span className="val">{fmt(subtotal)}</span>
              </td>
              <td>
                <span className="label">VALOR DO FRETE</span>
                <span className="val">{fmt(shipping)}</span>
              </td>
              <td>
                <span className="label">DESCONTO</span>
                <span className="val">{fmt(discount)}</span>
              </td>
              <td>
                <span className="label">VALOR TOTAL DA NOTA</span>
                <span className="val" style={{ fontSize: 12 }}>
                  {fmt(total)}
                </span>
              </td>
            </tr>
          </tbody>
        </table>

        {/* ── FORMA DE PAGAMENTO ── */}
        <div className="section-title">Informações de Pagamento</div>
        <table style={{ marginBottom: 2 }}>
          <tbody>
            <tr>
              <td>
                <span className="label">FORMA DE PAGAMENTO</span>
                <span className="val">
                  {order.payment?.method === 'PIX'
                    ? 'PIX'
                    : order.payment?.method === 'CREDIT_CARD'
                      ? 'Cartão de Crédito'
                      : order.payment?.method === 'DEBIT_CARD'
                        ? 'Cartão de Débito'
                        : order.payment?.method === 'BOLETO'
                          ? 'Boleto'
                          : '—'}
                </span>
              </td>
              <td>
                <span className="label">VALOR</span>
                <span className="val">{fmt(total)}</span>
              </td>
              <td>
                <span className="label">STATUS</span>
                <span className="val">{order.payment?.status ?? '—'}</span>
              </td>
            </tr>
          </tbody>
        </table>

        {/* ── INFORMAÇÕES ADICIONAIS ── */}
        <div className="section-title">Informações Complementares</div>
        <table>
          <tbody>
            <tr>
              <td style={{ height: 40 }}>
                <span className="label">INFORMAÇÕES COMPLEMENTARES</span>
                <span className="val">
                  Pedido #{invoice.orderId.slice(-8).toUpperCase()} — NF-e emitida por {emitterName}
                  {invoice.protocol ? ` — Protocolo: ${invoice.protocol}` : ''}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
