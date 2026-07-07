import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { Role } from '@prisma/client';
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
import { VerifyEmailDto } from './dto/verify-email.dto';
import { AuthResult, JwtRefreshPayload, PublicUser } from './types/auth.types';
import type { User } from '@prisma/client';
import { UpdateMeDto } from './dto/update-me.dto';

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

    const tokens = await this.issueTokenPair(user.id, user.email, user.role, ip, userAgent);

    await this.auditService.log(AuditAction.REGISTER, {
      userId: user.id,
      ipAddress: ip,
      userAgent,
    });

    // Conta fica ativa e utilizável imediatamente — a verificação roda em paralelo,
    // sem bloquear o cadastro (MailService.send() nunca lança, só loga e retorna false).
    await this.sendVerificationEmail(user.id, user.email, user.name);

    return { user: this.toPublicUser(user), ...tokens };
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

    if (!user.isActive)
      throw new ForbiddenException('Conta desativada. Entre em contato com o suporte.');

    const tokens = await this.issueTokenPair(user.id, user.email, user.role, ip, userAgent);

    await this.auditService.log(AuditAction.LOGIN, {
      userId: user.id,
      ipAddress: ip,
      userAgent,
    });

    return { user: this.toPublicUser(user), ...tokens };
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

    const tokens = await this.issueTokenPair(
      stored.user.id,
      stored.user.email,
      stored.user.role,
      ip,
      userAgent,
    );

    await this.auditService.log(AuditAction.REFRESH_TOKEN, { userId, ipAddress: ip, userAgent });

    return {
      user: this.toPublicUser(stored.user),
      ...tokens,
    };
  }

  async forgotPassword(dto: ForgotPasswordDto, ip: string): Promise<void> {
    await this.rateLimitService.check(`forgot:ip:${ip}`, 20, 3600);

    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    // Always return success — never reveal whether an email is registered
    if (!user) return;

    await this.rateLimitService.check(`forgot:user:${user.id}`, 10, 3600);

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

  async verifyEmail(dto: VerifyEmailDto): Promise<void> {
    const tokenHash = this.hashService.hashToken(dto.token);
    const record = await this.prisma.emailVerification.findUnique({ where: { tokenHash } });

    if (!record || record.isUsed || record.expiresAt < new Date()) {
      throw new BadRequestException('Link de confirmação inválido ou expirado.');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: new Date() },
      }),
      this.prisma.emailVerification.update({
        where: { tokenHash },
        data: { isUsed: true },
      }),
    ]);

    await this.auditService.log(AuditAction.EMAIL_VERIFIED, { userId: record.userId });
  }

  async resendVerification(userId: string): Promise<void> {
    await this.rateLimitService.check(`resend-verification:user:${userId}`, 3, 3600);

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.emailVerifiedAt) return;

    await this.sendVerificationEmail(user.id, user.email, user.name);
  }

  private async sendVerificationEmail(
    userId: string,
    email: string,
    name: string | null,
  ): Promise<void> {
    // Invalida links de confirmação pendentes antes de emitir um novo.
    await this.prisma.emailVerification.updateMany({
      where: { userId, isUsed: false },
      data: { isUsed: true },
    });

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = this.hashService.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 24 * 3_600_000); // 24 horas

    await this.prisma.emailVerification.create({
      data: { userId, tokenHash, expiresAt },
    });

    await this.mailService.sendVerificationEmail(email, rawToken, name ?? undefined);

    await this.auditService.log(AuditAction.EMAIL_VERIFICATION_SENT, { userId });
  }

  async getMe(userId: string): Promise<PublicUser & { createdAt: Date }> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        name: true,
        phone: true,
        avatarUrl: true,
        emailVerifiedAt: true,
        createdAt: true,
      },
    });
    return { ...this.toPublicUser(user), createdAt: user.createdAt };
  }

  async updateMe(userId: string, dto: UpdateMeDto): Promise<PublicUser> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone || null } : {}),
      },
    });
    return this.toPublicUser(user);
  }

  async updateAvatarUrl(userId: string, avatarUrl: string): Promise<PublicUser> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
    });
    return this.toPublicUser(user);
  }

  private toPublicUser(
    user: Pick<User, 'id' | 'email' | 'name' | 'role' | 'phone' | 'avatarUrl' | 'emailVerifiedAt'>,
  ): PublicUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      emailVerifiedAt: user.emailVerifiedAt,
    };
  }

  private async issueTokenPair(
    userId: string,
    email: string,
    role: Role,
    ip: string,
    userAgent: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = this.tokenService.generateAccessToken({ sub: userId, email, role });
    const refreshToken = this.tokenService.generateRefreshToken(userId);
    const tokenHash = this.hashService.hashToken(refreshToken);
    const expiresAt = this.tokenService.getRefreshTokenExpiry();

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash, expiresAt, ipAddress: ip, userAgent },
    });

    return { accessToken, refreshToken };
  }
}
