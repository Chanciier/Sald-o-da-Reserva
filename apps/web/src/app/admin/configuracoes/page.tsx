'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Shield, Wrench, Plug } from 'lucide-react';
import { SectionGate } from '@/components/admin/section-gate';

const TABS = [
  { id: 'integracoes', label: 'Integrações', icon: Plug },
  { id: 'seguranca', label: 'Segurança', icon: Shield },
  { id: 'sistema', label: 'Sistema', icon: Wrench },
];

const INTEGRATIONS = [
  {
    name: 'Mercado Pago',
    desc: 'Gateway de pagamento (PIX, Cartão, Boleto)',
    status: true,
    envKey: 'MERCADO_PAGO_ACCESS_TOKEN',
  },
  {
    name: 'Melhor Envio',
    desc: 'Cálculo de frete e emissão de etiquetas',
    status: true,
    envKey: 'MELHOR_ENVIO_TOKEN',
  },
  {
    name: 'eNotas',
    desc: 'Emissão de notas fiscais eletrônicas',
    status: true,
    envKey: 'ENOTAS_API_KEY',
  },
  {
    name: 'Amazon S3',
    desc: 'Armazenamento de imagens de produtos',
    status: true,
    envKey: 'AWS_ACCESS_KEY_ID',
  },
  {
    name: 'Cloudflare Turnstile',
    desc: 'Proteção CAPTCHA no registro',
    status: true,
    envKey: 'TURNSTILE_SECRET_KEY',
  },
];

const SECURITY_ITEMS = [
  { label: 'Autenticação JWT', desc: 'Access token 15min + Refresh token 30 dias', ok: true },
  { label: 'Hash de senhas', desc: 'Argon2id com salt automático', ok: true },
  { label: 'Rate limiting', desc: 'Proteção contra brute-force nos endpoints sensíveis', ok: true },
  { label: 'RBAC', desc: 'Controle de acesso por perfil (ADMIN, VENDEDOR, CLIENTE)', ok: true },
  { label: 'Audit Log', desc: 'Registro de ações administrativas sensíveis', ok: true },
  { label: 'CORS configurado', desc: 'Apenas o frontend autorizado acessa a API', ok: true },
  {
    label: 'Webhook Mercado Pago',
    desc: 'Assinatura de webhook configurada',
    ok: false,
    warn: 'MERCADO_PAGO_WEBHOOK_SECRET não configurado',
  },
];

const SYSTEM_ITEMS = [
  { label: 'Banco de dados', desc: 'PostgreSQL + Prisma ORM', ok: true },
  { label: 'Cache', desc: 'Redis (carrinho, sessões, rate limiting)', ok: true },
  { label: 'Fila de emails', desc: 'Resend para transações e alertas', ok: true },
  { label: 'Scheduler', desc: 'Cron para retry automático de notas fiscais', ok: true },
  {
    label: 'Logs de pagamento',
    desc: 'Tabela PaymentLog registra todos os eventos de pagamento',
    ok: true,
  },
];

export default function AdminConfiguracoesPage() {
  return (
    <SectionGate section="CONFIGURACOES">
      <AdminConfiguracoes />
    </SectionGate>
  );
}

function AdminConfiguracoes() {
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') ?? 'integracoes';

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Estado das integrações e segurança do sistema
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border gap-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <Link
            key={id}
            href={`/admin/configuracoes?tab=${id}`}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </div>

      {/* Integrações */}
      {tab === 'integracoes' && (
        <div className="space-y-3">
          {INTEGRATIONS.map((i) => (
            <div
              key={i.name}
              className="flex items-center justify-between rounded-xl border bg-card px-5 py-4 shadow-sm"
            >
              <div>
                <p className="font-medium">{i.name}</p>
                <p className="text-sm text-muted-foreground">{i.desc}</p>
                <p className="text-xs text-muted-foreground/70 font-mono mt-0.5">{i.envKey}</p>
              </div>
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${i.status ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
              >
                {i.status ? 'Configurado' : 'Não configurado'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Segurança */}
      {tab === 'seguranca' && (
        <div className="space-y-3">
          {SECURITY_ITEMS.map((item) => (
            <div
              key={item.label}
              className={`flex items-start justify-between rounded-xl border px-5 py-4 shadow-sm ${item.ok ? 'bg-card' : 'bg-yellow-50 border-yellow-200'}`}
            >
              <div>
                <p className="font-medium">{item.label}</p>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
                {item.warn && (
                  <p className="text-xs text-yellow-700 mt-1 font-medium">{item.warn}</p>
                )}
              </div>
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium shrink-0 ml-4 ${item.ok ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}
              >
                {item.ok ? 'Ativo' : 'Atenção'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Sistema */}
      {tab === 'sistema' && (
        <div className="space-y-3">
          {SYSTEM_ITEMS.map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between rounded-xl border bg-card px-5 py-4 shadow-sm"
            >
              <div>
                <p className="font-medium">{item.label}</p>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${item.ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
              >
                {item.ok ? 'Operacional' : 'Inativo'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
