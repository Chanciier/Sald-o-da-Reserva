import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { LearningService } from './learning.service';
import { CategoryBias, LearningDashboard } from './learning.types';

@Controller('learning')
export class LearningController {
  constructor(private readonly learningService: LearningService) {}

  /**
   * Chamado pelo storefront a cada visita à página de um produto. Público —
   * não exige login (todo visitante conta como acesso). Protegido só pelo
   * rate-limit global (ThrottlerModule).
   */
  @Post('track-view/:productId')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  async trackView(@Param('productId') productId: string): Promise<void> {
    await this.learningService.trackView(productId);
  }

  /** Viés aprendido para uma categoria — usado para popular `PricingInput.learningBias`. */
  @Get('bias/:categoryId')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  getBias(@Param('categoryId') categoryId: string): Promise<CategoryBias> {
    return this.learningService.getBias(categoryId);
  }

  /** Painel: totais por tipo de evento, viés por categoria, eventos recentes. */
  @Get('dashboard')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  getDashboard(): Promise<LearningDashboard> {
    return this.learningService.getDashboard();
  }
}
