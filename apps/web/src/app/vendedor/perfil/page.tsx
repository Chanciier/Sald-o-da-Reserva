'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { AvatarUploader, formatPhone } from '@/components/profile/avatar-uploader';
import { getMeApi, updateMeApi, uploadAvatarApi } from '@/lib/auth-api';

export default function VendedorPerfil() {
  const { user, token, updateUser } = useAuth();

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => getMeApi(token!),
    enabled: !!token,
  });

  const [name, setName] = useState(user?.name ?? '');
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

  return (
    <div className="space-y-5 max-w-lg">
      <h1 className="text-xl font-bold">Meu Perfil</h1>

      <div className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
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
            <span className="inline-flex mt-1 rounded-full bg-blue-100 text-blue-800 px-2 py-0.5 text-xs font-medium">
              {user?.role}
            </span>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Nome completo</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome"
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
    </div>
  );
}
