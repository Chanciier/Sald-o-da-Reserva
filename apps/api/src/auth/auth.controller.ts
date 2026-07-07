import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { TurnstileGuard } from './guards/turnstile.guard';
import { AuthenticatedUser } from './types/auth.types';
import { StorageService } from '../storage/storage.service';

const ALLOWED_AVATAR_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5 MB

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly storage: StorageService,
  ) {}

  @Post('register')
  @Public()
  @UseGuards(TurnstileGuard)
  @Throttle({ medium: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, accessToken, refreshToken } = await this.authService.register(
      dto,
      this.getIp(req),
      this.getUserAgent(req),
    );
    this.setCookies(res, accessToken, refreshToken);
    return { user, accessToken };
  }

  @Post('login')
  @Public()
  @UseGuards(TurnstileGuard)
  @Throttle({ medium: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, accessToken, refreshToken } = await this.authService.login(
      dto,
      this.getIp(req),
      this.getUserAgent(req),
    );
    this.setCookies(res, accessToken, refreshToken);
    return { user, accessToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken: string = req.cookies?.refresh_token || '';
    await this.authService.logout(user.id, refreshToken, this.getIp(req), this.getUserAgent(req));
    this.clearCookies(res);
    return { message: 'Logout realizado com sucesso.' };
  }

  @Post('refresh')
  @Public()
  @UseGuards(JwtRefreshGuard)
  @HttpCode(HttpStatus.OK)
  async refresh(
    @CurrentUser() user: { id: string; refreshToken: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const {
      user: authUser,
      accessToken,
      refreshToken,
    } = await this.authService.refresh(
      user.id,
      user.refreshToken,
      this.getIp(req),
      this.getUserAgent(req),
    );
    this.setCookies(res, accessToken, refreshToken);
    return { user: authUser, accessToken };
  }

  @Post('forgot-password')
  @Public()
  @Throttle({ medium: { limit: 3, ttl: 3_600_000 } })
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    await this.authService.forgotPassword(dto, this.getIp(req));
    return {
      message:
        'Se o email estiver cadastrado, você receberá as instruções de recuperação em breve.',
    };
  }

  @Post('reset-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.resetPassword(dto, this.getIp(req));
    this.clearCookies(res);
    return { message: 'Senha redefinida com sucesso. Faça login com sua nova senha.' };
  }

  @Post('verify-email')
  @Public()
  @Throttle({ medium: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    await this.authService.verifyEmail(dto);
    return { message: 'E-mail confirmado com sucesso.' };
  }

  @Post('resend-verification')
  @Throttle({ medium: { limit: 3, ttl: 3_600_000 } })
  @HttpCode(HttpStatus.OK)
  async resendVerification(@CurrentUser() user: AuthenticatedUser) {
    await this.authService.resendVerification(user.id);
    return { message: 'Se seu e-mail ainda não foi confirmado, reenviamos o link.' };
  }

  @Get('me')
  @HttpCode(HttpStatus.OK)
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getMe(user.id);
  }

  @Patch('me')
  @HttpCode(HttpStatus.OK)
  async updateMe(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateMeDto) {
    return this.authService.updateMe(user.id, dto);
  }

  @Post('me/avatar')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      fileFilter(_req, file, cb) {
        if (!ALLOWED_AVATAR_MIME.includes(file.mimetype)) {
          return cb(new BadRequestException(`Tipo não permitido: ${file.mimetype}`), false);
        }
        cb(null, true);
      },
      limits: { fileSize: MAX_AVATAR_SIZE },
    }),
  )
  async updateAvatar(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Nenhuma imagem enviada.');
    const image = await this.storage.uploadAvatar(file, user.id);
    return this.authService.updateAvatarUrl(user.id, image.url);
  }

  // ─── private helpers ──────────────────────────────────────────────────────

  private setCookies(res: Response, accessToken: string, refreshToken: string): void {
    const isProd = process.env.NODE_ENV === 'production';
    const base = { httpOnly: true, secure: isProd, sameSite: 'strict' as const };

    res.cookie('access_token', accessToken, {
      ...base,
      maxAge: 15 * 60 * 1000,
      path: '/',
    });

    res.cookie('refresh_token', refreshToken, {
      ...base,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/api/v1/auth',
    });
  }

  private clearCookies(res: Response): void {
    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('refresh_token', { path: '/api/v1/auth' });
  }

  private getIp(req: Request): string {
    return (
      (req.headers['cf-connecting-ip'] as string) ||
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      'unknown'
    );
  }

  private getUserAgent(req: Request): string {
    return (req.headers['user-agent'] as string) || '';
  }
}
