'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { createReturnRequest, type ReturnReason } from '@/actions/returns';

const REASONS: { value: ReturnReason; label: string }[] = [
  { value: 'REGRET', label: 'Arrependimento' },
  { value: 'DEFECT', label: 'Defeito' },
  { value: 'WRONG_ITEM', label: 'Produto incorreto' },
  { value: 'OTHER', label: 'Outro' },
];

interface ReturnModalProps {
  orderId: string;
  token: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function ReturnModal({ orderId, token, onClose, onSuccess }: ReturnModalProps) {
  const [reason, setReason] = useState<ReturnReason>('REGRET');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await createReturnRequest(token, orderId, reason, notes || undefined);
      onSuccess();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-semibold">Solicitar Devolução</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Motivo da devolução *</p>
            <div className="space-y-2">
              {REASONS.map((r) => (
                <label
                  key={r.value}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                >
                  <input
                    type="radio"
                    name="reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    className="accent-primary"
                  />
                  <span className="text-sm font-medium">{r.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Detalhes adicionais (opcional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Descreva o problema ou motivo..."
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
            Sua solicitação será analisada em até 3 dias úteis. Você receberá as instruções de
            devolução por e-mail.
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border py-2 text-sm hover:bg-muted transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {loading ? 'Enviando...' : 'Solicitar devolução'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
