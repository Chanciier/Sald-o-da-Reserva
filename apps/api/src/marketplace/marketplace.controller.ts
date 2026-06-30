import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { Marketplace, Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { MarketplaceHubService } from './marketplace-hub.service';
import { MlOrderImportService } from './providers/ml-order-import.service';
import { PublishProductDto } from './dto/publish-product.dto';

const CUID = /^[a-z0-9]{20,32}$/i;

/**
 * Endpoints administrativos do painel de marketplaces (/admin/marketplaces).
 * Todos restritos a ADMIN — tokens/credenciais nunca trafegam para o frontend.
 */
@Controller('marketplaces')
@Roles(Role.ADMIN)
export class MarketplaceController {
  constructor(
    private readonly hub: MarketplaceHubService,
    private readonly prisma: PrismaService,
    private readonly mlImport: MlOrderImportService,
  ) {}

  /** Baixa o PDF da etiqueta do Mercado Livre de um pedido (equipe de expedição). */
  @Get('ml/orders/:orderId/label')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  @Header('Content-Type', 'application/pdf')
  async mlLabel(@Param('orderId') orderId: string, @Res() res: Response) {
    this.assertCuid(orderId);
    const { buffer, contentType } = await this.mlImport.getLabelPdf(orderId);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="etiqueta-ml-${orderId.slice(-8)}.pdf"`);
    res.send(buffer);
  }

  /** Importa/reconcilia manualmente um pedido do ML pelo id (suporte/diagnóstico). */
  @Post('ml/orders/:mlOrderId/import')
  @HttpCode(HttpStatus.ACCEPTED)
  async importMlOrder(@Param('mlOrderId') mlOrderId: string) {
    if (!/^\d+$/.test(mlOrderId)) {
      throw new BadRequestException('Id de pedido do Mercado Livre inválido.');
    }
    return this.mlImport.importByOrderId(mlOrderId);
  }

  /** Saúde por marketplace: conexão, publicados, erros, última sync, filas. */
  @Get('health')
  health() {
    return this.hub.health();
  }

  /** Publicações de um produto (status em cada canal). */
  @Get('publications/:productId')
  publications(@Param('productId') productId: string) {
    this.assertCuid(productId);
    return this.prisma.marketplacePublication.findMany({
      where: { productId },
      orderBy: { marketplace: 'asc' },
    });
  }

  /** Dispara publicação manual de um produto nos canais escolhidos. */
  @Post('publish/:productId')
  @HttpCode(HttpStatus.ACCEPTED)
  async publish(@Param('productId') productId: string, @Body() dto: PublishProductDto) {
    this.assertCuid(productId);
    await this.hub.enqueuePublish(productId, dto.marketplaces);
    return { enqueued: true, marketplaces: dto.marketplaces };
  }

  /** "Tentar novamente" uma publicação que falhou. */
  @Post(':marketplace/retry/:productId')
  @HttpCode(HttpStatus.ACCEPTED)
  async retry(@Param('marketplace') marketplace: string, @Param('productId') productId: string) {
    this.assertCuid(productId);
    await this.hub.retryPublication(productId, this.parseMarketplace(marketplace));
    return { enqueued: true };
  }

  /** "Sincronizar agora" — reenvia os dados atuais do produto ao canal. */
  @Post(':marketplace/sync/:productId')
  @HttpCode(HttpStatus.ACCEPTED)
  async sync(@Param('marketplace') marketplace: string, @Param('productId') productId: string) {
    this.assertCuid(productId);
    await this.hub.syncNow(productId, this.parseMarketplace(marketplace));
    return { enqueued: true };
  }

  /** Painel: "Tentar novamente" todas as publicações com erro do canal. */
  @Post(':marketplace/retry-failed')
  @HttpCode(HttpStatus.ACCEPTED)
  async retryFailed(@Param('marketplace') marketplace: string) {
    const count = await this.hub.retryFailed(this.parseMarketplace(marketplace));
    return { enqueued: true, count };
  }

  /** Painel: "Sincronizar agora" todos os produtos vivos do canal. */
  @Post(':marketplace/sync-all')
  @HttpCode(HttpStatus.ACCEPTED)
  async syncAll(@Param('marketplace') marketplace: string) {
    const count = await this.hub.syncAll(this.parseMarketplace(marketplace));
    return { enqueued: true, count };
  }

  private assertCuid(id: string): void {
    if (!CUID.test(id)) {
      throw new BadRequestException('Identificador de produto inválido.');
    }
  }

  private parseMarketplace(value: string): Marketplace {
    const normalized = value?.toUpperCase();
    if (!Object.values(Marketplace).includes(normalized as Marketplace)) {
      throw new BadRequestException(`Marketplace inválido: ${value}`);
    }
    return normalized as Marketplace;
  }
}
