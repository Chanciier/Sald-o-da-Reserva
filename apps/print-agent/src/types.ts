export type JobType = 'PICKUP' | 'SHIPPING';

export interface PrintJob {
  id: string;
  orderId: string;
  type: JobType;
  documentUrl: string | null;
  copies: number;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface HistoryEntry {
  jobId: string;
  orderId: string;
  jobType: JobType;
  status: 'PRINTED' | 'FAILED';
  message: string | null;
  at: string;
}

export interface AppSnapshot {
  connection: ConnectionStatus;
  paired: boolean;
  deviceName: string | null;
  pickupPrinter: string | null;
  shippingPrinter: string | null;
  copies: number;
  autostart: boolean;
  paused: boolean;
  pending: PrintJob[];
  history: HistoryEntry[];
  lastPrint: HistoryEntry | null;
}

export interface SettingsInput {
  pickupPrinter: string | null;
  shippingPrinter: string | null;
  copies: number;
  autostart: boolean;
}
