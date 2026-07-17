export interface PrintDevice {
  id: string;
  name: string;
  online: boolean;
  lastSeen: string | null;
  pickupPrinter: string | null;
  shippingPrinter: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/** Só existe na resposta de criação/regeneração — nunca fica persistido em texto puro. */
export interface PrintDeviceWithToken extends PrintDevice {
  token: string;
}
