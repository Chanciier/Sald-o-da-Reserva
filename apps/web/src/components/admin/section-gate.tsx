'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, ShieldAlert, Clock, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  getMySellerPermissions,
  requestSectionAccess,
  validateSectionPassword,
  type AdminSection,
  type SectionState,
} from '@/lib/seller-permissions-api';

export const MY_PERMISSIONS_QUERY_KEY = ['my-seller-permissions'];

// Compartilhado pelo filtro de nav do admin/layout.tsx e por todo SectionGate
// da página — mesma queryKey, então o React Query evita requisições duplicadas.
export function useMySections() {
  const { token, user } = useAuth();
  return useQuery({
    queryKey: MY_PERMISSIONS_QUERY_KEY,
    queryFn: () => getMySellerPermissions(token!),
    enabled: !!token && user?.role === 'VENDEDOR',
    staleTime: 15_000,
  });
}

interface SectionGateProps {
  /** Seção (ou seções, com semântica OR) que protege o conteúdo. */
  section: AdminSection | AdminSection[];
  children: React.ReactNode;
}

// Bloqueia o conteúdo de uma página admin conforme a permissão do vendedor
// logado. ADMIN sempre passa direto. Isto é só UX — a proteção real é o
// SectionAccessGuard no backend, que rejeita a chamada à API de qualquer forma.
export function SectionGate({ section, children }: SectionGateProps) {
  const { user } = useAuth();
  const { data, isLoading } = useMySections();

  if (user?.role !== 'VENDEDOR') return <>{children}</>;

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const wanted = Array.isArray(section) ? section : [section];
  const states = wanted
    .map((s) => data.find((x) => x.section === s))
    .filter((s): s is SectionState => !!s);

  if (states.some((s) => s.unlocked)) return <>{children}</>;

  const primary = states[0];
  if (!primary || primary.mode === 'NONE') return <BlockedScreen />;
  if (primary.mode === 'PASSWORD') {
    return <PasswordScreen section={primary.section} label={primary.label} />;
  }
  return (
    <AuthorizationScreen
      section={primary.section}
      label={primary.label}
      hasPendingRequest={!!primary.hasPendingRequest}
    />
  );
}

function Shell({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-6 py-16 text-center shadow-sm">
      {icon}
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      {children}
    </div>
  );
}

function BlockedScreen() {
  return (
    <Shell
      icon={<ShieldAlert className="h-8 w-8 text-muted-foreground" />}
      title="Sem acesso a esta seção"
      description="Fale com um administrador se precisar acessar esta área do painel."
    />
  );
}

function PasswordScreen({ section, label }: { section: AdminSection; label: string }) {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await validateSectionPassword(token!, section, password);
      await queryClient.invalidateQueries({ queryKey: MY_PERMISSIONS_QUERY_KEY });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Senha incorreta.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Shell
      icon={<Lock className="h-8 w-8 text-muted-foreground" />}
      title={`"${label}" exige senha de acesso`}
      description="Peça a senha desta seção a um administrador."
    >
      <form onSubmit={handleSubmit} className="mt-2 flex w-full max-w-xs flex-col gap-2">
        <Input
          type="password"
          placeholder="Senha da seção"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting || !password}>
          {submitting ? 'Verificando...' : 'Desbloquear'}
        </Button>
      </form>
    </Shell>
  );
}

function AuthorizationScreen({
  section,
  label,
  hasPendingRequest,
}: {
  section: AdminSection;
  label: string;
  hasPendingRequest: boolean;
}) {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRequest() {
    setSubmitting(true);
    setError(null);
    try {
      await requestSectionAccess(token!, section);
      await queryClient.invalidateQueries({ queryKey: MY_PERMISSIONS_QUERY_KEY });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar a solicitação.');
    } finally {
      setSubmitting(false);
    }
  }

  if (hasPendingRequest) {
    return (
      <Shell
        icon={<Clock className="h-8 w-8 text-muted-foreground" />}
        title="Solicitação enviada"
        description={`Sua solicitação de acesso a "${label}" está aguardando aprovação de um administrador.`}
      />
    );
  }

  return (
    <Shell
      icon={<ShieldCheck className="h-8 w-8 text-muted-foreground" />}
      title={`"${label}" exige autorização`}
      description="Envie uma solicitação para um administrador liberar esta seção para você."
    >
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button className="mt-2" onClick={handleRequest} disabled={submitting}>
        {submitting ? 'Enviando...' : 'Solicitar acesso'}
      </Button>
    </Shell>
  );
}
