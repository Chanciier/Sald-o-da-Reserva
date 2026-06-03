import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { HashService } from './services/hash.service';
import { TokenService } from './services/token.service';
import { RateLimitService } from './services/rate-limit.service';
import { AuditAction, AuditService } from './services/audit.service';
import { MailService } from './services/mail.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AuthResult, AuthenticatedUser, JwtRefreshPayload } from './types/auth.types';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hashService: HashService,
    private readonly tokenService: TokenService,
    private readonly rateLimitService: RateLimitService,
    private readonly auditService: AuditService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto, ip: string, userAgent: string): Promise<AuthResult> {
    await this.rateLimitService.check(`register:ip:${ip}`, 5, 3600);

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email já cadastrado.');

    const passwordHash = await this.hashService.hashPassword(dto.password);

    const user = await this.prisma.user.create({
      data: { email: dto.email, name: dto.name, passwordHash },
    });

    const tokens = await this.issueTokenPair(user.id, user.email, ip, userAgent);

    await this.auditService.log(AuditAction.REGISTER, {
      userId: user.id,
      ipAddress: ip,
      userAgent,
    });

    return { user: { id: user.id, email: user.email }, ...tokens };
  }

  async login(dto: LoginDto, ip: string, userAgent: string): Promise<AuthResult> {
    await this.rateLimitService.check(`login:ip:${ip}`, 10, 900);
    await this.rateLimitService.check(`login:email:${dto.email}`, 5, 900);

    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    if (!user || !(await this.hashService.verifyPassword(user.passwordHash, dto.password))) {
      await this.auditService.log(AuditAction.LOGIN_FAILED, {
        ipAddress: ip,
        userAgent,
        metadata: { email: dto.email } as Record<string, string>,
      });
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    if (!user.isActive) throw new ForbiddenException('Conta desativada. Entre em contato com o suporte.');

    const tokens = await this.issueTokenPair(user.id, user.email, ip, userAgent);

    await this.auditService.log(AuditAction.LOGIN, {
      userId: user.id,
      ipAddress: ip,
      userAgent,
    });

    return { user: { id: user.id, email: user.email }, ...tokens };
  }

  async logout(userId: string, refreshToken: string, ip: string, userAgent: string): Promise<void> {
    if (refreshToken) {
      const tokenHash = this.hashService.hashToken(refreshToken);
      await this.prisma.refreshToken.updateMany({
        where: { userId, tokenHash, isRevoked: false },
        data: { isRevoked: true },
      });
    }

    await this.auditService.log(AuditAction.LOGOUT, { userId, ipAddress: ip, userAgent });
  }

  async refresh(
    userId: string,
    refreshToken: string,
    ip: string,
    userAgent: string,
  ): Promise<AuthResult> {
    let payload: JwtRefreshPayload;
    try {
      payload = this.tokenService.verifyRefreshToken(refreshToken);
    } catch {
      throw new UnauthorizedException('Token de refresh inválido.');
    }

    if (payload.sub !== userId) throw new UnauthorizedException('Token de refresh inválido.');

    const tokenHash = this.hashService.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored) throw new UnauthorizedException('Token de refresh inválido.');

    if (stored.isRevoked) {
      // Token reuse attack detected — revoke all active tokens for this user
      await this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, isRevoked: false },
        data: { isRevoked: true },
      });
      await this.auditService.log(AuditAction.TOKEN_REUSE_DETECTED, {
        userId: stored.userId,
        ipAddress: ip,
        userAgent,
      });
      throw new UnauthorizedException('Sessão inválida. Faça login novamente.');
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Sessão expirada. Faça login novamente.');
    }

    // Rotate — revoke current token and issue a fresh pair
    await this.prisma.refreshToken.update({
      where: { tokenHash },
      data: { isRevoked: true },
    });

    const tokens = await this.issueTokenPair(stored.user.id, stored.user.email, ip, userAgent);

    await this.auditService.log(AuditAction.REFRESH_TOKEN, { userId, ipAddress: ip, userAgent });

    return { user: { id: stored.user.id, email: stored.user.email }, ...tokens };
  }

  async forgotPassword(dto: ForgotPasswordDto, ip: string): Promise<void> {
    await this.rateLimitService.check(`forgot:ip:${ip}`, 5, 3600);

    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    // Always return success — never reveal whether an email is registered
    if (!user) return;

    await this.rateLimitService.check(`forgot:user:${user.id}`, 3, 3600);

    // Invalidate all pending reset tokens before issuing a new one
    await this.prisma.passwordReset.updateMany({
      where: { userId: user.id, isUsed: false },
      data: { isUsed: true },
    });

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = this.hashService.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 3_600_000); // 1 hour

    await this.prisma.passwordReset.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    await this.mailService.sendPasswordResetEmail(user.email, rawToken, user.name ?? undefined);

    await this.auditService.log(AuditAction.FORGOT_PASSWORD, {
      userId: user.id,
      ipAddress: ip,
    });
  }

  async resetPassword(dto: ResetPasswordDto, ip: string): Promise<void> {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('As senhas não coincidem.');
    }

    const tokenHash = this.hashService.hashToken(dto.token);
    const record = await this.prisma.passwordReset.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!record || record.isUsed || record.expiresAt < new Date()) {
      throw new BadRequestException('Token inválido ou expirado.');
    }

    const passwordHash = await this.hashService.hashPassword(dto.password);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordReset.update({
        where: { tokenHash },
        data: { isUsed: true },
      }),
      // Revoke all active sessions after password reset
      this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, isRevoked: false },
        data: { isRevoked: true },
      }),
    ]);

    await this.auditService.log(AuditAction.RESET_PASSWORD, {
      userId: record.userId,
      ipAddress: ip,
    });
  }

  async getMe(userId: string): Promise<AuthenticatedUser & { name: string | null; createdAt: Date }> {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, name: true, createdAt: true },
    });
  }

  private async issueTokenPair(
    userId: string,
    email: string,
    ip: string,
    userAgent: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = this.tokenService.generateAccessToken({ sub: userId, email });
    const refreshToken = this.tokenService.generateRefreshToken(userId);
    const tokenHash = this.hashService.hashToken(refreshToken);
    const expiresAt = this.tokenService.getRefreshTokenExpiry();

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash, expiresAt, ipAddress: ip, userAgent },
    });

    return { accessToken, refreshToken };
  }
}
