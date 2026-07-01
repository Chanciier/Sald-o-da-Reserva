'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { MapPin, CreditCard, Truck, ShoppingBag, ChevronRight } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { AvatarUploader, formatPhone } from '@/components/profile/avatar-uploader';
import { getMeApi, updateMeApi, uploadAvatarApi } from '@/lib/auth-api';

const QUICK_LINKS = [
  { href: '/pedidos', label: 'Meus Pedidos', icon: ShoppingBag },
  { href: '/cliente/enderecos', label: 'Meus Endereços', icon: MapPin },
  { href: '/cliente/pagamentos', label: 'Pagamentos', icon: CreditCard },
  { href: '/cliente/rastreamento', label: 'Rastreamento', icon: Truck },
];

export default function ClientePerfil() {
  const { user, token, updateUser } = useAuth();

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => getMeApi(token!),
    enabled: !!token,
  });

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (me) {
      setName(me.name ?? '');
      setPhone(me.phone ? formatPhone(me.phone) : '');
    }
  }, [me]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      const updated = await updateMeApi(token!, {
        name: name.trim(),
        phone: phone.replace(/\D/g, ''),
      });
      updateUser(updated);
      setSuccess(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarUpload(file: File) {
    const updated = await uploadAvatarApi(token!, file);
    updateUser(updated);
  }

  const memberSince = me?.createdAt
    ? new Date(me.createdAt).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    : null;

  return (
    <div className="space-y-6 max-w-lg">
      <h1 className="text-xl font-bold">Meu Perfil</h1>

      <div className="rounded-xl border bg-card p-6 shadow-sm space-y-6">
        <div className="flex items-center gap-4">
          <AvatarUploader
            name={user?.name ?? null}
            email={user?.email ?? null}
            avatarUrl={user?.avatarUrl ?? null}
            onUpload={handleAvatarUpload}
          />
          <div>
            <p className="font-semibold">{user?.name ?? '—'}</p>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
            {memberSince && (
              <p className="text-xs text-muted-foreground/70 mt-1">Cliente desde {memberSince}</p>
            )}
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Nome completo</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome"
              required
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Telefone / WhatsApp</label>
            <input
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              placeholder="(00) 00000-0000"
              inputMode="numeric"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Usado para avisos sobre seus pedidos.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">E-mail</label>
            <input
              value={user?.email ?? ''}
              disabled
              className="w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm text-muted-foreground cursor-not-allowed"
            />
            <p className="text-xs text-muted-foreground mt-1">O e-mail não pode ser alterado.</p>
          </div>

          {success && (
            <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
              Perfil atualizado com sucesso.
            </p>
          )}
          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {saving ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </form>
      </div>

      <div className="rounded-xl border bg-card shadow-sm divide-y">
        {QUICK_LINKS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center justify-between px-5 py-3.5 text-sm hover:bg-muted transition-colors first:rounded-t-xl last:rounded-b-xl"
          >
            <span className="flex items-center gap-3">
              <Icon className="h-4 w-4 text-muted-foreground" />
              {label}
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </div>
  );
}
