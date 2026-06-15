import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import makeWASocket, {
  AuthenticationCreds,
  AuthenticationState,
  DisconnectReason,
  SignalKeyStore,
  initAuthCreds,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import * as QRCode from 'qrcode';
import { RedisService } from '../redis/redis.service';

const CREDS_KEY = 'wa:creds';
const KEY_PREFIX = 'wa:k:';

function serialize(v: unknown): string {
  return JSON.stringify(v, (_k, val) => {
    if (val instanceof Uint8Array || Buffer.isBuffer(val)) {
      return { _t: 'buf', d: Buffer.from(val).toString('base64') };
    }
    return val;
  });
}

function deserialize<T>(s: string): T {
  return JSON.parse(s, (_k, val) => {
    if (val && typeof val === 'object' && val._t === 'buf') {
      return Buffer.from(val.d, 'base64');
    }
    return val;
  }) as T;
}

@Injectable()
export class BaileysService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BaileysService.name);
  private socket: ReturnType<typeof makeWASocket> | null = null;
  private qrBase64: string | null = null;
  private connected = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(private readonly redis: RedisService) {}

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    try {
      await this.socket?.end(undefined as never);
    } catch {
      // ignore
    }
  }

  private makeKeyStore(): SignalKeyStore {
    const redis = this.redis;
    return {
      async get(type, ids) {
        const result: Record<string, unknown> = {};
        await Promise.all(
          ids.map(async (id) => {
            const val = await redis.get(`${KEY_PREFIX}${type}:${id}`);
            if (val) result[id] = deserialize(val);
          }),
        );
        return result as never;
      },
      async set(data) {
        await Promise.all(
          Object.entries(data).flatMap(([type, typeData]) =>
            Object.entries(typeData ?? {}).map(async ([id, value]) => {
              const key = `${KEY_PREFIX}${type}:${id}`;
              if (value != null) {
                await redis.set(key, serialize(value));
              } else {
                await redis.del(key);
              }
            }),
          ),
        );
      },
    };
  }

  private async loadState(): Promise<{
    state: AuthenticationState;
    saveCreds: (c: AuthenticationCreds) => Promise<void>;
  }> {
    const raw = await this.redis.get(CREDS_KEY);
    const creds: AuthenticationCreds = raw ? deserialize(raw) : initAuthCreds();
    const keys = this.makeKeyStore();
    const saveCreds = async (c: AuthenticationCreds) => {
      await this.redis.set(CREDS_KEY, serialize(c));
    };
    return { state: { creds, keys }, saveCreds };
  }

  async connect(): Promise<void> {
    const { state, saveCreds } = await this.loadState();

    this.socket = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      browser: ['Saldão da Reserva', 'Chrome', '126.0.0'],
      syncFullHistory: false,
    });

    this.socket.ev.on('creds.update', () => {
      if (this.socket) saveCreds(this.socket.authState.creds);
    });

    this.socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.qrBase64 = await QRCode.toDataURL(qr).catch(() => null);
        this.logger.log('QR code gerado');
      }

      if (connection === 'open') {
        this.connected = true;
        this.qrBase64 = null;
        this.logger.log('WhatsApp conectado');
      }

      if (connection === 'close') {
        this.connected = false;
        const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;

        if (loggedOut) {
          this.logger.warn('WhatsApp deslogado — credenciais limpas, escaneie o QR');
          await this.clearSession();
        } else {
          this.logger.warn(`Desconectado (${code}) — reconectando em 5s`);
          this.reconnectTimer = setTimeout(() => void this.connect(), 5000);
        }
      }
    });
  }

  async clearSession(): Promise<void> {
    await this.redis.del(CREDS_KEY);
    await this.redis.delPattern(`${KEY_PREFIX}*`);
    this.connected = false;
    this.qrBase64 = null;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    await this.connect();
  }

  getQr(): string | null {
    return this.qrBase64;
  }

  isReady(): boolean {
    return this.connected;
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    if (!this.socket || !this.connected) throw new Error('WhatsApp não conectado');
    await this.socket.sendMessage(jid, { text });
  }

  async sendImage(jid: string, imageUrl: string, caption: string): Promise<void> {
    if (!this.socket || !this.connected) throw new Error('WhatsApp não conectado');
    await this.socket.sendMessage(jid, { image: { url: imageUrl }, caption });
  }
}
