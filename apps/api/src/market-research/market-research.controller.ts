import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { MarketResearchDto } from './dto/market-research.dto';
import { MarketResearchService } from './market-research.service';
import { MarketResearchJob } from './market-research.types';

@Controller('market-research')
export class MarketResearchController {
  constructor(private readonly marketResearch: MarketResearchService) {}

  /**
   * Dispara (ou reaproveita) a pesquisa de mercado do Hermes Agent para um
   * produto identificado. NUNCA bloqueia: devolve o estado (PENDING/READY) na
   * hora — a pesquisa real roda em background. O painel deve fazer poll em
   * `GET /market-research/:key` até `status` virar `READY`/`FAILED`.
   */
  @Post()
  @Roles(Role.ADMIN, Role.VENDEDOR)
  request(@Body() dto: MarketResearchDto): Promise<MarketResearchJob> {
    return this.marketResearch.request(dto);
  }

  /** Poll do resultado de uma pesquisa pela `key` devolvida em `POST /market-research`. */
  @Get(':key')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  async getByKey(@Param('key') key: string): Promise<MarketResearchJob> {
    const job = await this.marketResearch.get(key);
    if (!job) throw new NotFoundException('Pesquisa de mercado não encontrada.');
    return job;
  }
}
