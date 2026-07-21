import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { createHash } from 'crypto';
import type { IncomingMessage, Server as HttpServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { PrismaService } from '../prisma/prisma.service';
import { PrintDevicesService } from './print-devices.service';
import type { PrintJob } from '@prisma/client';

const WS_PATH = '/print-agent/ws';
const PING_INTERVAL_MS = 30_000;

interface ConnectedDevice {
  id: string;
  pickupPrinter: string | null;
  shippingPrinter: string | null;
}

interface TrackedSocket {
  ws: WebSocket;
  device: ConnectedDevice;
  isAlive: boolean;
}

/**
 * WebSocket cru (biblioteca `ws`, não socket.io) para o Print Agent.
 *
 * O painel admin já usa socket.io (`NotificationsGateway`) e o Nest só
 * permite um adapter de WebSocket global — trocar afetaria as notificações
 * existentes. Em vez disso, este servidor é anexado manualmente à mesma
 * instância HTTP (via `HttpAdapterHost`, sem tocar em `main.ts`) num path
 * próprio (`/print-agent/ws`), coexistindo com o upgrade handler do
 * socket.io sem conflito (cada um só reage ao seu próprio path).
 *
 * Autenticação: token do dispositivo na query string (`?token=`), mesmo hash
 * SHA-256 usado pelo `DeviceTokenGuard`. Nunca loga o token.
 */
@Injectable()
export class PrintAgentWsGateway implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(PrintAgentWsGateway.name);
  private wss?: WebSocketServer;
  private pingInterval?: ReturnType<typeof setInterval>;
  private readonly sockets = new Map<string, Set<TrackedSocket>>();

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly prisma: PrismaService,
    private readonly devices: PrintDevicesService,
  ) {}

  onApplicationBootstrap(): void {
    const httpServer = this.adapterHost.httpAdapter.getHttpServer() as HttpServer;
    this.wss = new WebSocketServer({ noServer: true });

    httpServer.on('upgrade', (request: IncomingMessage, socket, head) => {
      const { pathname, searchParams } = new URL(request.url ?? '', 'http://localhost');
      if (pathname !== WS_PATH) return; // não é nosso — deixa outro listener (socket.io) tratar

      void this.authenticate(searchParams.get('token')).then((device) => {
        if (!device) {
          socket.write(
            'HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n',
          );
          socket.destroy();
          return;
        }
        this.wss!.handleUpgrade(request, socket, head, (ws) => this.onConnection(ws, device));
      });
    });

    this.pingInterval = setInterval(() => this.pingAll(), PING_INTERVAL_MS);
    this.logger.log(`Print Agent WS ouvindo em ${WS_PATH}`);
  }

  onModuleDestroy(): void {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.wss?.close();
  }

  /** Envia um job pronto para todos os devices conectados cujo perfil de impressora bate com o tipo. */
  pushJobReady(
    job: Pick<PrintJob, 'id' | 'orderId' | 'type' | 'documentUrl' | 'printerProfile'>,
  ): void {
    const payload = JSON.stringify({ type: 'job', job });
    let sent = 0;

    for (const trackedSet of this.sockets.values()) {
      for (const tracked of trackedSet) {
        if (!this.matchesProfile(tracked.device, job.type)) continue;
        if (tracked.ws.readyState !== WebSocket.OPEN) continue;
        tracked.ws.send(payload);
        sent += 1;
      }
    }

    if (sent === 0) {
      this.logger.warn(`Nenhum device conectado apto a receber o job ${job.id} (${job.type})`);
    }
  }

  private matchesProfile(device: ConnectedDevice, type: PrintJob['type']): boolean {
    return type === 'PICKUP' ? !!device.pickupPrinter : !!device.shippingPrinter;
  }

  private async authenticate(token: string | null): Promise<ConnectedDevice | null> {
    if (!token) return null;
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const device = await this.prisma.printDevice.findUnique({ where: { tokenHash } });
    if (!device || device.revokedAt) return null;
    return {
      id: device.id,
      pickupPrinter: device.pickupPrinter,
      shippingPrinter: device.shippingPrinter,
    };
  }

  private onConnection(ws: WebSocket, device: ConnectedDevice): void {
    const tracked: TrackedSocket = { ws, device, isAlive: true };
    const set = this.sockets.get(device.id) ?? new Set<TrackedSocket>();
    set.add(tracked);
    this.sockets.set(device.id, set);

    this.logger.log(`Device ${device.id} conectado (${set.size} socket(s) ativo(s))`);
    void this.devices.heartbeat(device.id).catch(() => undefined);

    ws.on('pong', () => {
      tracked.isAlive = true;
    });

    ws.on('message', (raw) => {
      void this.onMessage(device.id, raw.toString());
    });

    ws.on('close', () => {
      set.delete(tracked);
      if (set.size === 0) {
        this.sockets.delete(device.id);
        void this.devices.setOnline(device.id, false).catch(() => undefined);
      }
      this.logger.log(`Device ${device.id} desconectado`);
    });

    ws.on('error', (err) => {
      this.logger.warn(`Erro no socket do device ${device.id}: ${err.message}`);
    });

    ws.send(JSON.stringify({ type: 'connected', deviceId: device.id }));
  }

  private async onMessage(deviceId: string, raw: string): Promise<void> {
    let msg: { type?: string };
    try {
      msg = JSON.parse(raw) as { type?: string };
    } catch {
      return; // mensagem inválida — ignora silenciosamente, não derruba a conexão
    }

    if (msg.type === 'heartbeat') {
      await this.devices.heartbeat(deviceId).catch(() => undefined);
      this.replyTo(deviceId, { type: 'pong' });
    }
  }

  private replyTo(deviceId: string, payload: unknown): void {
    const set = this.sockets.get(deviceId);
    if (!set) return;
    const data = JSON.stringify(payload);
    for (const tracked of set) {
      if (tracked.ws.readyState === WebSocket.OPEN) tracked.ws.send(data);
    }
  }

  /** Recipe padrão de heartbeat do `ws`: pinga tudo, derruba quem não respondeu ao ping anterior. */
  private pingAll(): void {
    for (const set of this.sockets.values()) {
      for (const tracked of set) {
        if (!tracked.isAlive) {
          tracked.ws.terminate();
          continue;
        }
        tracked.isAlive = false;
        tracked.ws.ping();
      }
    }
  }
}
