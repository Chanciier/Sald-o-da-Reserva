import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Notification } from '@prisma/client';
import type { Server, Socket } from 'socket.io';
import type { JwtPayload } from '../auth/types/auth.types';
import { PrismaService } from '../prisma/prisma.service';

const allowedOrigins = (process.env.FRONTEND_URL ?? 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

@WebSocketGateway({
  namespace: '/notifications',
  cors: { origin: allowedOrigins, credentials: true },
})
export class NotificationsGateway implements OnGatewayConnection {
  private readonly logger = new Logger(NotificationsGateway.name);

  @WebSocketServer()
  private server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const authToken =
      typeof client.handshake.auth?.token === 'string' ? client.handshake.auth.token : undefined;
    const authorization = client.handshake.headers.authorization;
    const token =
      authToken ?? (authorization?.startsWith('Bearer ') ? authorization.slice(7) : '');

    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, isActive: true },
      });
      if (!user?.isActive) throw new Error('Inactive user');

      client.data.userId = user.id;
      await client.join(this.userRoom(user.id));
    } catch {
      this.logger.warn(`Rejected notification socket ${client.id}`);
      client.disconnect(true);
    }
  }

  emitToUser(userId: string, notification: Notification): void {
    this.server.to(this.userRoom(userId)).emit('notification', notification);
  }

  private userRoom(userId: string): string {
    return `user:${userId}`;
  }
}
