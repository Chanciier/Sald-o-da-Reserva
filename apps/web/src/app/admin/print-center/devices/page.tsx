'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import {
  createPrintDevice,
  getPrintDevices,
  regeneratePrintDeviceToken,
  updatePrintDevice,
} from '@/lib/print-center-api';

export default function PrintCenterDevicesPage() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [pickupPrinter, setPickupPrinter] = useState('');
  const [shippingPrinter, setShippingPrinter] = useState('');
  const [revealedToken, setRevealedToken] = useState<{ deviceName: string; token: string } | null>(
    null,
  );

  const { data: devices, isLoading } = useQuery({
    queryKey: ['print-center-devices'],
    queryFn: () => getPrintDevices(token!),
    enabled: !!token,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createPrintDevice(token!, {
        name,
        pickupPrinter: pickupPrinter || undefined,
        shippingPrinter: shippingPrinter || undefined,
      }),
    onSuccess: (device) => {
      setRevealedToken({ deviceName: device.name, token: device.token });
      setName('');
      setPickupPrinter('');
      setShippingPrinter('');
      qc.invalidateQueries({ queryKey: ['print-center-devices'] });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: ({ id, revoked }: { id: string; revoked: boolean }) =>
      updatePrintDevice(token!, id, { revoked }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['print-center-devices'] }),
  });

  const regenerateMutation = useMutation({
    mutationFn: (id: string) => regeneratePrintDeviceToken(token!, id),
    onSuccess: (result, id) => {
      const device = devices?.find((d) => d.id === id);
      setRevealedToken({ deviceName: device?.name ?? 'Dispositivo', token: result.token });
    },
  });

  return (
    <div className="space-y-5">
      {revealedToken && (
        <div className="rounded-lg border border-primary/40 bg-primary/5 px-4 py-3 text-sm space-y-2">
          <p className="font-medium">
            Token de <strong>{revealedToken.deviceName}</strong> — copie agora, ele não será
            mostrado novamente:
          </p>
          <code className="block break-all rounded bg-background px-3 py-2 text-xs">
            {revealedToken.token}
          </code>
          <button
            onClick={() => setRevealedToken(null)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Fechar
          </button>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) createMutation.mutate();
        }}
        className="grid gap-3 rounded-xl border bg-card p-4 shadow-sm sm:grid-cols-4"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome do dispositivo (ex: PDV Loja 1)"
          required
          className="rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40 sm:col-span-2"
        />
        <input
          value={pickupPrinter}
          onChange={(e) => setPickupPrinter(e.target.value)}
          placeholder="Impressora de retirada"
          className="rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
        />
        <input
          value={shippingPrinter}
          onChange={(e) => setShippingPrinter(e.target.value)}
          placeholder="Impressora de envio"
          className="rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
        />
        <button
          type="submit"
          disabled={createMutation.isPending || !name.trim()}
          className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50 sm:col-span-4 sm:w-fit"
        >
          {createMutation.isPending ? 'Criando...' : 'Novo dispositivo'}
        </button>
      </form>

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : !devices?.length ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Nenhum dispositivo cadastrado ainda.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Nome</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Última atividade</th>
                  <th className="px-4 py-3 font-medium">Impressoras</th>
                  <th className="px-4 py-3 font-medium">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {devices.map((device) => (
                  <tr key={device.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-medium">{device.name}</td>
                    <td className="px-4 py-3">
                      {device.revokedAt ? (
                        <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/30 dark:text-red-300">
                          Revogado
                        </span>
                      ) : device.online ? (
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-300">
                          Online
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                          Offline
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {device.lastSeen ? new Date(device.lastSeen).toLocaleString('pt-BR') : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {device.pickupPrinter ?? '—'} / {device.shippingPrinter ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => regenerateMutation.mutate(device.id)}
                          disabled={regenerateMutation.isPending}
                          className="rounded-lg border px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
                        >
                          Novo token
                        </button>
                        <button
                          onClick={() =>
                            revokeMutation.mutate({ id: device.id, revoked: !device.revokedAt })
                          }
                          disabled={revokeMutation.isPending}
                          className={`rounded-lg border px-2.5 py-1.5 text-xs disabled:opacity-50 ${
                            device.revokedAt
                              ? 'hover:bg-muted'
                              : 'border-destructive/50 text-destructive hover:bg-destructive/10'
                          }`}
                        >
                          {device.revokedAt ? 'Reativar' : 'Revogar'}
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
    </div>
  );
}
