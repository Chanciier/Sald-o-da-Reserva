import { apiFetch } from './cart-api';
import type { PrintJob, PrintJobStatus, PrintJobType } from '@/types/print-job';
import type { PrintDevice, PrintDeviceWithToken } from '@/types/print-device';

// ── Jobs ──────────────────────────────────────────────────────────────────

export const getPrintJobs = (
  token: string,
  query: { status?: PrintJobStatus; type?: PrintJobType } = {},
) => {
  const params = new URLSearchParams();
  if (query.status) params.set('status', query.status);
  if (query.type) params.set('type', query.type);
  const qs = params.toString();
  return apiFetch<PrintJob[]>(`/print-center/jobs${qs ? `?${qs}` : ''}`, token);
};

export const reprintPrintJob = (token: string, id: string) =>
  apiFetch<PrintJob>(`/print-center/jobs/${id}/reprint`, token, { method: 'POST' });

export const createManualPrintJob = (token: string, orderId: string) =>
  apiFetch<PrintJob>(`/print-center/jobs/manual/${orderId}`, token, { method: 'POST' });

// ── Devices ───────────────────────────────────────────────────────────────

export const getPrintDevices = (token: string) =>
  apiFetch<PrintDevice[]>('/print-center/devices', token);

export const createPrintDevice = (
  token: string,
  body: { name: string; pickupPrinter?: string; shippingPrinter?: string },
) =>
  apiFetch<PrintDeviceWithToken>('/print-center/devices', token, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const updatePrintDevice = (
  token: string,
  id: string,
  body: Partial<{
    name: string;
    pickupPrinter: string;
    shippingPrinter: string;
    revoked: boolean;
  }>,
) =>
  apiFetch<PrintDevice>(`/print-center/devices/${id}`, token, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

export const regeneratePrintDeviceToken = (token: string, id: string) =>
  apiFetch<{ id: string; token: string }>(`/print-center/devices/${id}/regenerate-token`, token, {
    method: 'POST',
  });

// ── Confirmar retirada (a partir da etiqueta impressa) ──────────────────────
// Reaproveita o endpoint já existente do módulo de Expedição — o Print Center
// nunca reescreve essa lógica, só chama.

export const confirmarRetiradaExpedicao = (token: string, orderId: string) =>
  apiFetch<{ id: string; status: string }>(`/expedicao/${orderId}/confirmar-retirada`, token, {
    method: 'PATCH',
  });
