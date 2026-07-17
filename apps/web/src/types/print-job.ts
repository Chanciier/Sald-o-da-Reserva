export type PrintJobType = 'PICKUP' | 'SHIPPING';

export type PrintJobStatus = 'PENDING' | 'READY' | 'SENT' | 'PRINTING' | 'PRINTED' | 'FAILED';

export interface PrintJob {
  id: string;
  orderId: string;
  type: PrintJobType;
  status: PrintJobStatus;
  copies: number;
  attempts: number;
  printerProfile: string | null;
  documentUrl: string | null;
  lastError: string | null;
  deviceId: string | null;
  sentAt: string | null;
  printedAt: string | null;
  createdAt: string;
  updatedAt: string;
  order: {
    id: string;
    buyerName: string | null;
    deliveryMethod: string;
  };
  device: { id: string; name: string } | null;
}
