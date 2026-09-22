import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TurnstileGuard } from '../auth/guards/turnstile.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { GuestCheckoutDto } from '../auth/dto/guest-checkout.dto';
import { ClubSignupService } from './club-signup.service';

@Controller('club-signup')
export class ClubSignupController {
  constructor(private readonly clubSignup: ClubSignupService) {}

  // Checagem usada pela tela ao sair do campo CPF — throttle mais aberto que
  // o POST (só leitura), mas ainda limitado pra não virar um jeito de varrer
  // CPFs em busca de sócios.
  @Get('check-cpf/:cpf')
  @Public()
  @Throttle({ medium: { limit: 20, ttl: 60_000 } })
  async checkCpf(@Param('cpf') cpf: string) {
    return this.clubSignup.checkCpfStatus(cpf);
  }

  // OptionalJwtAuthGuard: quem já está logado usa a própria conta (sem
  // duplicar); sem sessão, cria conta-convidado. Nunca bloqueia anônimo.
  @Post()
  @Public()
  @UseGuards(OptionalJwtAuthGuard, TurnstileGuard)
  @Throttle({ medium: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  async subscribe(
    @Body() dto: GuestCheckoutDto,
    @Req() req: Request,
    @CurrentUser('id') userId?: string,
  ) {
    return this.clubSignup.subscribe(dto, this.getIp(req), this.getUserAgent(req), userId);
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
