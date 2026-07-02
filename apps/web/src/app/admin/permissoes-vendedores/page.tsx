'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, RefreshCw, ShieldQuestion } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { Badge } from '@/components/ui/badge';
import { listSellerPermissions } from '@/lib/seller-permissions-api';
import { PermissionSectionEditor } from './permission-section-editor';

export default function PermissoesVendedoresPage() {
  const { user, token, loading } = useAuth();
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user && user.role !== 'ADMIN') {
      router.push('/admin');
    }
  }, [user, loading, router]);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['seller-permissions-admin'],
    queryFn: () => listSellerPermissions(token!),
    enabled: !!token && user?.role === 'ADMIN',
  });

  if (loading || !user || user.role !== 'ADMIN') {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const totalPending = data?.reduce((sum, v) => sum + v.pendingRequests.length, 0) ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Permissões de Vendedores</h1>
          <p className="text-sm text-muted-foreground">
            Controle quais seções do painel cada vendedor pode acessar.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {totalPending > 0 && (
            <Badge variant="warning" className="gap-1">
              <ShieldQuestion className="h-3 w-3" />
              {totalPending} solicitação(ões) pendente(s)
            </Badge>
          )}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      <div className="rounded-xl border bg-card shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : !data?.length ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Nenhum vendedor cadastrado ainda.
          </p>
        ) : (
          <div className="divide-y">
            {data.map((vendedor) => {
              const unlockedCount = vendedor.permissions.filter((p) => p.unlocked).length;
              const isOpen = expandedId === vendedor.id;
              return (
                <div key={vendedor.id}>
                  <button
                    onClick={() => setExpandedId(isOpen ? null : vendedor.id)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{vendedor.name ?? '—'}</p>
                        <p className="truncate text-xs text-muted-foreground">{vendedor.email}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {vendedor.pendingRequests.length > 0 && (
                        <Badge variant="warning">
                          {vendedor.pendingRequests.length} pendente(s)
                        </Badge>
                      )}
                      <Badge variant={unlockedCount > 0 ? 'secondary' : 'outline'}>
                        {unlockedCount}/{vendedor.permissions.length} liberadas
                      </Badge>
                      {!vendedor.isActive && <Badge variant="destructive">Inativo</Badge>}
                    </div>
                  </button>
                  {isOpen && <PermissionSectionEditor vendedor={vendedor} token={token!} />}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
