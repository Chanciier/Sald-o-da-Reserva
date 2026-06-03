import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export enum AuditAction {
  REGISTER = 'REGISTER',
  LOGIN = 'LOGIN',
  LOGIN_FAILED = 'LOGIN_FAILED',
  LOGOUT = 'LOGOUT',
  REFRESH_TOKEN = 'REFRESH_TOKEN',
  FORGOT_PASSWORD = 'FORGOT_PASSWORD',
  RESET_PASSWORD = 'RESET_PASSWORD',
  TOKEN_REUSE_DETECTED = 'TOKEN_REUSE_DETECTED',
}

interface AuditOptions {
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(action: AuditAction, options: AuditOptions = {}): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action,
          userId: options.userId,
          ipAddress: options.ipAddress,
          userAgent: options.userAgent,
          metadata: options.metadata,
        },
      });
    } catch (err) {
      this.logger.error('Failed to create audit log', (err as Error).message);
    }
  }
}
