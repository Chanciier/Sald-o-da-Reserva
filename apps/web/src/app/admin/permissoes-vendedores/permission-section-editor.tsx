'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  ADMIN_SECTIONS,
  MODE_LABELS,
  SECTION_LABELS,
  approveAccessRequest,
  denyAccessRequest,
  updateSellerPermissions,
  type AdminSection,
  type SectionAccessMode,
  type VendedorPermissions,
} from '@/lib/seller-permissions-api';

const MODE_OPTIONS: SectionAccessMode[] = ['NONE', 'FREE', 'PASSWORD', 'AUTHORIZATION'];

interface EditState {
  mode: SectionAccessMode;
  password: string;
  dirty: boolean;
}

export function PermissionSectionEditor({
  vendedor,
  token,
}: {
  vendedor: VendedorPermissions;
  token: string;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const initial = useMemo<Record<AdminSection, EditState>>(() => {
    const map = {} as Record<AdminSection, EditState>;
    for (const section of ADMIN_SECTIONS) {
      const current = vendedor.permissions.find((p) => p.section === section);
      map[section] = { mode: current?.mode ?? 'NONE', password: '', dirty: false };
    }
    return map;
  }, [vendedor.permissions]);

  const [edits, setEdits] = useState(initial);

  function setMode(section: AdminSection, mode: SectionAccessMode) {
    setSuccess(false);
    setEdits((prev) => ({ ...prev, [section]: { ...prev[section], mode, dirty: true } }));
  }

  function setPassword(section: AdminSection, password: string) {
    setSuccess(false);
    setEdits((prev) => ({ ...prev, [section]: { ...prev[section], password, dirty: true } }));
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const dirtyEntries = ADMIN_SECTIONS.filter((section) => edits[section].dirty);
      if (dirtyEntries.length === 0) return;

      for (const section of dirtyEntries) {
        if (edits[section].mode === 'PASSWORD' && !edits[section].password) {
          throw new Error(`Informe uma senha para "${SECTION_LABELS[section]}" antes de salvar.`);
        }
      }

      return updateSellerPermissions(
        token,
        vendedor.id,
        dirtyEntries.map((section) => ({
          section,
          mode: edits[section].mode,
          password: edits[section].password || undefined,
        })),
      );
    },
    onSuccess: (result) => {
      setError(null);
      setSuccess(true);
      if (result) {
        setEdits((prev) => {
          const next = { ...prev };
          for (const section of ADMIN_SECTIONS) {
            next[section] = { ...next[section], password: '', dirty: false };
          }
          return next;
        });
      }
      queryClient.invalidateQueries({ queryKey: ['seller-permissions-admin'] });
    },
    onError: (err: Error) => setError(err.message ?? 'Erro ao salvar permissões.'),
  });

  const resolveMutation = useMutation({
    mutationFn: ({ requestId, approve }: { requestId: string; approve: boolean }) =>
      approve ? approveAccessRequest(token, requestId) : denyAccessRequest(token, requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller-permissions-admin'] });
    },
  });

  const dirtyCount = ADMIN_SECTIONS.filter((s) => edits[s].dirty).length;

  return (
    <div className="space-y-4 border-t bg-muted/20 p-4">
      {vendedor.pendingRequests.length > 0 && (
        <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
            Solicitações de acesso pendentes
          </p>
          {vendedor.pendingRequests.map((request) => (
            <div key={request.id} className="flex items-center justify-between gap-2 text-sm">
              <span>
                {SECTION_LABELS[request.section]}
                {request.message && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    — &ldquo;{request.message}&rdquo;
                  </span>
                )}
              </span>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={resolveMutation.isPending}
                  onClick={() => resolveMutation.mutate({ requestId: request.id, approve: true })}
                  className="h-7 gap-1 px-2 text-xs"
                >
                  <Check className="h-3 w-3" /> Aprovar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={resolveMutation.isPending}
                  onClick={() => resolveMutation.mutate({ requestId: request.id, approve: false })}
                  className="h-7 gap-1 px-2 text-xs text-destructive hover:text-destructive"
                >
                  <X className="h-3 w-3" /> Negar
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Seção</th>
              <th className="px-3 py-2 font-medium">Modo de acesso</th>
              <th className="px-3 py-2 font-medium">Senha</th>
              <th className="px-3 py-2 font-medium">Status atual</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {ADMIN_SECTIONS.map((section) => {
              const current = vendedor.permissions.find((p) => p.section === section);
              return (
                <tr key={section}>
                  <td className="px-3 py-2 font-medium">{SECTION_LABELS[section]}</td>
                  <td className="px-3 py-2">
                    <Select
                      value={edits[section].mode}
                      onChange={(e) => setMode(section, e.target.value as SectionAccessMode)}
                      className="h-8 w-44 text-xs"
                    >
                      {MODE_OPTIONS.map((mode) => (
                        <option key={mode} value={mode}>
                          {MODE_LABELS[mode]}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-3 py-2">
                    {edits[section].mode === 'PASSWORD' ? (
                      <Input
                        type="password"
                        placeholder={
                          current?.mode === 'PASSWORD' ? 'Alterar senha' : 'Definir senha'
                        }
                        value={edits[section].password}
                        onChange={(e) => setPassword(section, e.target.value)}
                        className="h-8 w-40 text-xs"
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {current?.unlocked ? (
                      <Badge variant="success">Liberado</Badge>
                    ) : current?.mode && current.mode !== 'NONE' ? (
                      <Badge variant="warning">Aguardando</Badge>
                    ) : (
                      <Badge variant="outline">Bloqueado</Badge>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
      {success && dirtyCount === 0 && (
        <p className="text-xs text-green-700 dark:text-green-400">Permissões salvas.</p>
      )}

      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-muted-foreground">
          {dirtyCount > 0 ? `${dirtyCount} seção(ões) alterada(s)` : 'Nenhuma alteração'}
        </span>
        <Button
          size="sm"
          disabled={dirtyCount === 0 || saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          {saveMutation.isPending ? 'Salvando...' : 'Salvar permissões'}
        </Button>
      </div>
    </div>
  );
}
