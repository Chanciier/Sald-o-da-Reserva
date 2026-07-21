import { createServer, Server } from 'http';
import type { AddressInfo } from 'net';
import { createHash } from 'crypto';
import { WebSocket } from 'ws';
import { HttpAdapterHost } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { PrintDevicesService } from './print-devices.service';
import { PrintAgentWsGateway } from './print-agent-ws.gateway';

/**
 * Testes de integração leves: sobe um `http.Server` de verdade em 127.0.0.1
 * (não `localhost` — evita a resolução IPv6/IPv4 ambígua já conhecida neste
 * ambiente) e conecta com um cliente `ws` real, exercitando o handshake de
 * autenticação e o protocolo de mensagens ponta a ponta. Só Prisma e
 * PrintDevicesService são mocks.
 */
describe('PrintAgentWsGateway', () => {
  let httpServer: Server;
  let gateway: PrintAgentWsGateway;
  let prisma: { printDevice: { findUnique: jest.Mock } };
  let devices: { heartbeat: jest.Mock; setOnline: jest.Mock };
  let port: number;

  const TOKEN = 'device-token-abc';
  const TOKEN_HASH = createHash('sha256').update(TOKEN).digest('hex');

  function device(overrides: Record<string, unknown> = {}) {
    return {
      id: 'device-1',
      tokenHash: TOKEN_HASH,
      revokedAt: null,
      pickupPrinter: 'HP LaserJet',
      shippingPrinter: null,
      ...overrides,
    };
  }

  function connect(token?: string | null): WebSocket {
    const qs = token ? `?token=${encodeURIComponent(token)}` : '';
    return new WebSocket(`ws://127.0.0.1:${port}/print-agent/ws${qs}`);
  }

  beforeEach(async () => {
    httpServer = createServer();
    prisma = { printDevice: { findUnique: jest.fn() } };
    devices = {
      heartbeat: jest.fn().mockResolvedValue({ ok: true }),
      setOnline: jest.fn().mockResolvedValue(undefined),
    };

    gateway = new PrintAgentWsGateway(
      { httpAdapter: { getHttpServer: () => httpServer } } as unknown as HttpAdapterHost,
      prisma as unknown as PrismaService,
      devices as unknown as PrintDevicesService,
    );
    gateway.onApplicationBootstrap();

    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    port = (httpServer.address() as AddressInfo).port;
  });

  afterEach(async () => {
    gateway.onModuleDestroy();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it('rejeita conexão sem token (401)', (done) => {
    const ws = connect(null);
    ws.on('unexpected-response', (_req, res) => {
      expect(res.statusCode).toBe(401);
      done();
    });
  });

  it('rejeita token que não corresponde a nenhum device (401)', (done) => {
    prisma.printDevice.findUnique.mockResolvedValue(null);
    const ws = connect('token-invalido');
    ws.on('unexpected-response', (_req, res) => {
      expect(res.statusCode).toBe(401);
      done();
    });
  });

  it('rejeita device revogado mesmo com hash correto (401)', (done) => {
    prisma.printDevice.findUnique.mockResolvedValue(device({ revokedAt: new Date() }));
    const ws = connect(TOKEN);
    ws.on('unexpected-response', (_req, res) => {
      expect(res.statusCode).toBe(401);
      done();
    });
  });

  it('aceita token válido: confirma a conexão e marca o device online', (done) => {
    prisma.printDevice.findUnique.mockResolvedValue(device());
    const ws = connect(TOKEN);

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      expect(msg).toEqual({ type: 'connected', deviceId: 'device-1' });
      expect(devices.heartbeat).toHaveBeenCalledWith('device-1');
      ws.close();
    });
    ws.on('close', () => done());
  });

  it('marca o device offline quando o socket fecha', (done) => {
    prisma.printDevice.findUnique.mockResolvedValue(device());
    const ws = connect(TOKEN);

    ws.on('open', () => ws.close());
    ws.on('close', () => {
      // pequeno atraso: o handler 'close' do servidor roda depois do 'close' do client
      setTimeout(() => {
        expect(devices.setOnline).toHaveBeenCalledWith('device-1', false);
        done();
      }, 50);
    });
  });

  it('heartbeat de aplicação: cliente envia, servidor responde pong', (done) => {
    prisma.printDevice.findUnique.mockResolvedValue(device());
    const ws = connect(TOKEN);

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'connected') {
        ws.send(JSON.stringify({ type: 'heartbeat' }));
        return;
      }
      if (msg.type === 'pong') {
        expect(devices.heartbeat).toHaveBeenCalledTimes(2); // connect + heartbeat
        ws.close();
        done();
      }
    });
  });

  it('pushJobReady só entrega para devices cujo perfil de impressora bate com o tipo do job', (done) => {
    prisma.printDevice.findUnique.mockResolvedValue(
      device({ pickupPrinter: 'HP', shippingPrinter: null }),
    );
    const ws = connect(TOKEN);
    const receivedJobs: string[] = [];

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'connected') {
        // SHIPPING não deveria ser entregue (este device só tem pickupPrinter).
        gateway.pushJobReady({
          id: 'job-shipping',
          orderId: 'order-1',
          type: 'SHIPPING',
          documentUrl: null,
          printerProfile: 'shipping',
        });
        // PICKUP deveria ser entregue.
        gateway.pushJobReady({
          id: 'job-pickup',
          orderId: 'order-2',
          type: 'PICKUP',
          documentUrl: 'https://cdn.example.com/label.png',
          printerProfile: 'pickup',
        });
        return;
      }
      if (msg.type === 'job') {
        receivedJobs.push(msg.job.id);
      }
    });

    setTimeout(() => {
      expect(receivedJobs).toEqual(['job-pickup']);
      ws.close();
      done();
    }, 150);
  });
});
