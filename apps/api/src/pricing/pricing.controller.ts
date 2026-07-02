import { Body, Controller, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { PricingRequestDto } from './dto/pricing-request.dto';
import { PricingService } from './pricing.service';
import { PricingResult } from './pricing.types';

@Controller('pricing')
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  /**
   * Gera 3 sugestões de preço (Agressivo/Equilibrado/Premium) a partir do
   * preço médio de mercado (Hermes) e/ou do catálogo próprio, cada uma com
   * explicação. Não persiste nada — o admin escolhe e aplica manualmente.
   */
  @Post('suggest')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  suggest(@Body() dto: PricingRequestDto): Promise<PricingResult> {
    return this.pricingService.suggest(dto);
  }
}
