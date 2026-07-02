'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ticket, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, X } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { SectionGate } from '@/components/admin/section-gate';

const API = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/v1`;

type CouponType = 'PERCENT' | 'FIXED';

interface Coupon {
  id: string;
  code: string;
  description?: string | null;
  type: CouponType;
  value: number;
  minOrderValue?: number | null;
  maxDiscount?: number | null;
  usageLimit?: number | null;
  usageCount: number;
  isActive: boolean;
  expiresAt?: string | null;
  createdAt: string;
}

interface CouponForm {
  code: string;
  description: string;
  type: CouponType;
  value: string;
  minOrderValue: string;
  maxDiscount: string;
  usageLimit: string;
  isActive: boolean;
  expiresAt: string;
}

const emptyForm: CouponForm = {
  code: '',
  description: '',
  type: 'PERCENT',
  value: '',
  minOrderValue: '',
  maxDiscount: '',
  usageLimit: '',
  isActive: true,
  expiresAt: '',
};

async function apiFetch(url: string, token: string, options?: RequestInit) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options?.headers ?? {}),
    },
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { message?: string }).message ?? `Erro ${res.status}`);
  return data;
}

function fmt(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatValue(type: CouponType, value: number) {
  return type === 'PERCENT' ? `${value}%` : fmt(value);
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl border bg-card shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b px-5 py-4 shrink-0">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function StatusBadge({ active, expiresAt }: { active: boolean; expiresAt?: string | null }) {
  const expired = expiresAt && new Date(expiresAt) < new Date();
  if (expired)
    return (
      <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
        Expirado
      </span>
    );
  if (active)
    return (
      <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-300">
        Ativo
      </span>
    );
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      Inativo
    </span>
  );
}

export default function AdminCuponsPage() {
  return (
    <SectionGate section="CUPONS">
      <AdminCupons />
    </SectionGate>
  );
}

function AdminCupons() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [modal, setModal] = useState<'create' | 'edit' | 'delete' | null>(null);
  const [selected, setSelected] = useState<Coupon | null>(null);
  const [form, setForm] = useState<CouponForm>(emptyForm);
  const [formError, setFormError] = useState('');

  const { data: coupons = [], isLoading } = useQuery<Coupon[]>({
    queryKey: ['admin-coupons'],
    queryFn: () => apiFetch(`${API}/coupons`, token!),
    enabled: !!token,
  });

  const createMutation = useMutation({
    mutationFn: (body: object) =>
      apiFetch(`${API}/coupons`, token!, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-coupons'] });
      closeModal();
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: (body: object) =>
      apiFetch(`${API}/coupons/${selected!.id}`, token!, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-coupons'] });
      closeModal();
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiFetch(`${API}/coupons/${selected!.id}`, token!, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-coupons'] });
      closeModal();
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiFetch(`${API}/coupons/${id}`, token!, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-coupons'] }),
  });

  function openCreate() {
    setForm(emptyForm);
    setFormError('');
    setModal('create');
  }
  function openEdit(c: Coupon) {
    setSelected(c);
    setForm({
      code: c.code,
      description: c.description ?? '',
      type: c.type,
      value: String(c.value),
      minOrderValue: c.minOrderValue != null ? String(c.minOrderValue) : '',
      maxDiscount: c.maxDiscount != null ? String(c.maxDiscount) : '',
      usageLimit: c.usageLimit != null ? String(c.usageLimit) : '',
      isActive: c.isActive,
      expiresAt: c.expiresAt ? c.expiresAt.split('T')[0] : '',
    });
    setFormError('');
    setModal('edit');
  }
  function openDelete(c: Coupon) {
    setSelected(c);
    setFormError('');
    setModal('delete');
  }
  function closeModal() {
    setModal(null);
    setSelected(null);
  }

  function buildBody() {
    const body: Record<string, unknown> = {
      code: form.code.trim().toUpperCase(),
      type: form.type,
      value: parseFloat(form.value),
      isActive: form.isActive,
    };
    if (form.description.trim()) body.description = form.description.trim();
    if (form.minOrderValue) body.minOrderValue = parseFloat(form.minOrderValue);
    if (form.maxDiscount && form.type === 'PERCENT')
      body.maxDiscount = parseFloat(form.maxDiscount);
    if (form.usageLimit) body.usageLimit = parseInt(form.usageLimit, 10);
    if (form.expiresAt) body.expiresAt = new Date(form.expiresAt).toISOString();
    return body;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!form.code.trim()) return setFormError('Código é obrigatório.');
    if (!form.value || isNaN(parseFloat(form.value))) return setFormError('Valor é obrigatório.');
    if (form.type === 'PERCENT' && parseFloat(form.value) > 100)
      return setFormError('Percentual não pode ser maior que 100.');
    const body = buildBody();
    if (modal === 'create') createMutation.mutate(body);
    else updateMutation.mutate(body);
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Ticket className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">Cupons</h1>
          {coupons.length > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {coupons.length}
            </span>
          )}
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" /> Novo Cupom
        </button>
      </div>

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : !coupons.length ? (
          <p className="py-16 text-center text-sm text-muted-foreground">Nenhum cupom cadastrado</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Código</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium">Desconto</th>
                  <th className="px-4 py-3 font-medium">Pedido Mín.</th>
                  <th className="px-4 py-3 font-medium">Uso</th>
                  <th className="px-4 py-3 font-medium">Expira</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {coupons.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono font-bold text-primary">{c.code}</span>
                      {c.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {c.type === 'PERCENT' ? 'Percentual' : 'Valor Fixo'}
                    </td>
                    <td className="px-4 py-3 font-semibold">{formatValue(c.type, c.value)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {c.minOrderValue ? fmt(c.minOrderValue) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {c.usageCount}
                      {c.usageLimit ? `/${c.usageLimit}` : ''}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {c.expiresAt ? new Date(c.expiresAt).toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge active={c.isActive} expiresAt={c.expiresAt} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => toggleMutation.mutate({ id: c.id, isActive: !c.isActive })}
                          disabled={toggleMutation.isPending}
                          title={c.isActive ? 'Desativar' : 'Ativar'}
                          className="rounded-lg p-1.5 hover:bg-muted transition-colors"
                        >
                          {c.isActive ? (
                            <ToggleRight className="h-4 w-4 text-green-500" />
                          ) : (
                            <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                          )}
                        </button>
                        <button
                          onClick={() => openEdit(c)}
                          className="rounded-lg p-1.5 hover:bg-muted transition-colors"
                          title="Editar"
                        >
                          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                        <button
                          onClick={() => openDelete(c)}
                          className="rounded-lg p-1.5 hover:bg-destructive/10 transition-colors"
                          title="Excluir"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(modal === 'create' || modal === 'edit') && (
        <Modal title={modal === 'create' ? 'Novo Cupom' : 'Editar Cupom'} onClose={closeModal}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium">Código *</label>
                <input
                  type="text"
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                  placeholder="PROMO10"
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium">Tipo *</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as CouponType }))}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="PERCENT">Percentual (%)</option>
                  <option value="FIXED">Valor Fixo (R$)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium">
                  {form.type === 'PERCENT' ? 'Desconto (%)' : 'Desconto (R$)'} *
                </label>
                <input
                  type="number"
                  value={form.value}
                  onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                  placeholder={form.type === 'PERCENT' ? '10' : '20.00'}
                  min="0.01"
                  step="0.01"
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              {form.type === 'PERCENT' && (
                <div>
                  <label className="mb-1.5 block text-xs font-medium">Desconto máximo (R$)</label>
                  <input
                    type="number"
                    value={form.maxDiscount}
                    onChange={(e) => setForm((f) => ({ ...f, maxDiscount: e.target.value }))}
                    placeholder="Opcional"
                    min="0"
                    step="0.01"
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium">Pedido mínimo (R$)</label>
                <input
                  type="number"
                  value={form.minOrderValue}
                  onChange={(e) => setForm((f) => ({ ...f, minOrderValue: e.target.value }))}
                  placeholder="Opcional"
                  min="0"
                  step="0.01"
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium">Limite de usos</label>
                <input
                  type="number"
                  value={form.usageLimit}
                  onChange={(e) => setForm((f) => ({ ...f, usageLimit: e.target.value }))}
                  placeholder="Ilimitado"
                  min="1"
                  step="1"
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium">Expira em</label>
              <input
                type="date"
                value={form.expiresAt}
                onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium">Descrição</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Descrição interna opcional"
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
              <input
                type="checkbox"
                id="isActive"
                checked={form.isActive}
                onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                className="h-4 w-4 rounded accent-primary"
              />
              <label htmlFor="isActive" className="text-sm cursor-pointer">
                Cupom ativo
              </label>
            </div>

            {formError && <p className="text-xs text-destructive">{formError}</p>}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={closeModal}
                className="flex-1 rounded-lg border py-2 text-sm hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="flex-1 rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {isPending ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === 'delete' && selected && (
        <Modal title="Excluir Cupom" onClose={closeModal}>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Tem certeza que deseja excluir o cupom{' '}
              <strong className="font-mono text-foreground">{selected.code}</strong>?
              {selected.usageCount > 0 && (
                <span className="block mt-1 text-amber-600 dark:text-amber-400">
                  Este cupom foi utilizado {selected.usageCount} vez(es).
                </span>
              )}
            </p>
            {formError && <p className="text-xs text-destructive">{formError}</p>}
            <div className="flex gap-2">
              <button
                onClick={closeModal}
                className="flex-1 rounded-lg border py-2 text-sm hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="flex-1 rounded-lg bg-destructive py-2 text-sm font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
