import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnalyticsEventType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappProvider } from './whatsapp.provider';
import { AIContentService } from './ai-content.service';

// Peso de cada sinal de engajamento no ranking de "produtos em alta" — clique e
// carrinho pesam mais que visualização por indicarem intenção de compra mais forte.
const ENGAGEMENT_WEIGHTS: Partial<Record<AnalyticsEventType, number>> = {
  [AnalyticsEventType.PRODUCT_VIEW]: 1,
  [AnalyticsEventType.PRODUCT_CLICK]: 3,
  [AnalyticsEventType.ADD_TO_CART]: 6,
};
const ENGAGEMENT_WINDOW_DAYS = 30;
// Prazo padrão (minutos) em que o WhatsApp permite "apagar para todos" — 2 dias
// e 12h. Usado quando WHATSAPP_DELETE_WINDOW_MINUTES não está configurado.
const DEFAULT_DELETE_WINDOW_MINUTES = 2 * 24 * 60 + 12 * 60;

interface ProductLike {
  id: string;
  name: string;
  slug: string;
  price: Prisma.Decimal;
  salePrice: Prisma.Decimal | null;
  stock: number;
  autoPublishWhatsapp: boolean;
  whatsappGroupIds: string[];
  images: { url: string }[];
  description?: string | null;
  brand?: string | null;
  category?: { name: string } | null;
}

@Injectable()
export class WhatsappMarketingService {
  private readonly logger = new Logger(WhatsappMarketingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappProvider,
    private readonly config: ConfigService,
    private readonly ai: AIContentService,
  ) {}

  async publishProduct(product: ProductLike, groupIds: string[]): Promise<void> {
    if (!product.autoPublishWhatsapp || !groupIds.length) return;

    const groups = await this.prisma.whatsappGroup.findMany({
      where: { id: { in: groupIds }, active: true },
    });

    if (!groups.length) return;

    const frontendUrl = (this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000')
      .split(',')[0]
      .trim();
    const productUrl = `${frontendUrl}/produtos/${product.slug}`;

    // Usa conteúdo editado manualmente se houver; senão gera via IA
    const existingContent = await this.prisma.whatsappContentHistory.findFirst({
      where: { productId: product.id, edited: true },
      orderBy: { updatedAt: 'desc' },
    });

    let message: string;
    if (existingContent) {
      message = existingContent.content;
      await this.prisma.whatsappContentHistory.update({
        where: { id: existingContent.id },
        data: { sent: true },
      });
    } else {
      message = await this.ai.generateAdCopy({
        name: product.name,
        category: product.category?.name,
        brand: product.brand ?? undefined,
        price: product.price.toNumber(),
        salePrice: product.salePrice?.toNumber(),
        stock: product.stock,
        description: product.description ?? undefined,
        productUrl,
      });
      await this.prisma.whatsappContentHistory.create({
        data: { productId: product.id, content: message, sent: true },
      });
    }

    const imageUrl = product.images?.[0]?.url;

    for (const group of groups) {
      let success = false;
      let error: string | undefined;
      let messageId: string | undefined;

      try {
        messageId = imageUrl
          ? await this.whatsapp.sendMedia(group.groupId, imageUrl, message)
          : await this.whatsapp.sendMessage(group.groupId, message);
        success = true;
      } catch (e) {
        error = (e as Error).message;
        this.logger.error(`Falha ao enviar para grupo ${group.name}: ${error}`);
      }

      await this.prisma.whatsappMessageLog
        .create({ data: { productId: product.id, groupId: group.id, success, error, messageId } })
        .catch(() => {});
    }
  }

  private deleteWindowMinutes(): number {
    const raw = Number(this.config.get<string>('WHATSAPP_DELETE_WINDOW_MINUTES'));
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_DELETE_WINDOW_MINUTES;
  }

  // Produto já postado nos grupos e editado (qualquer campo exceto estoque)
  // ainda dentro do prazo de exclusão do WhatsApp: apaga a mensagem desatualizada
  // em cada grupo onde foi postada e reenvia a versão corrigida (preço, nome,
  // foto etc. atuais). Se não houver mensagem recente dentro do prazo, não faz nada.
  async publishProductEdit(product: ProductLike): Promise<void> {
    if (!product.autoPublishWhatsapp || !product.whatsappGroupIds.length) return;

    const since = new Date(Date.now() - this.deleteWindowMinutes() * 60_000);
    const logs = await this.prisma.whatsappMessageLog.findMany({
      where: {
        productId: product.id,
        success: true,
        deletedAt: null,
        messageId: { not: null },
        sentAt: { gte: since },
        groupId: { in: product.whatsappGroupIds },
      },
      include: { group: true },
      orderBy: { sentAt: 'desc' },
    });
    if (!logs.length) return;

    // Mantém só a mensagem mais recente por grupo (pode haver mais de um envio
    // dentro do mesmo prazo).
    const latestPerGroup = new Map<string, (typeof logs)[number]>();
    for (const log of logs) {
      if (!latestPerGroup.has(log.groupId)) latestPerGroup.set(log.groupId, log);
    }

    for (const log of latestPerGroup.values()) {
      try {
        await this.whatsapp.deleteMessage(log.group.groupId, log.messageId!);
        await this.prisma.whatsappMessageLog.update({
          where: { id: log.id },
          data: { deletedAt: new Date() },
        });
      } catch (e) {
        this.logger.error(
          `Falha ao apagar mensagem antiga do produto ${product.id} no grupo ${log.group.name}: ${(e as Error).message}`,
        );
      }
    }

    await this.publishProduct(product, [...latestPerGroup.keys()]);
  }

  async resendProduct(productId: string): Promise<void> {
    const product = await this.prisma.product.findUniqueOrThrow({
      where: { id: productId },
      include: {
        images: { orderBy: { position: 'asc' } },
        category: { select: { name: true } },
      },
    });

    await this.publishProduct(product, product.whatsappGroupIds);
  }

  // IDs dos produtos elegíveis para broadcast (ativos e com estoque). Usado pela
  // campanha espaçada (WhatsappBroadcastService) para montar a fila aleatória.
  async getBroadcastProductIds(): Promise<string[]> {
    const products = await this.prisma.product.findMany({
      where: { status: 'ACTIVE', stock: { gt: 0 } },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return products.map((p) => p.id);
  }

  // IDs dos produtos ativos com mais engajamento (visualização/clique/carrinho)
  // nos últimos 30 dias, do mais procurado pro menos. Usado pela rotina de disparo
  // pra reforçar itens com mais chance de conversão quando sobra horário no dia
  // (catálogo ativo menor que a quantidade de disparos programados).
  async getTopProductIds(limit: number): Promise<string[]> {
    const since = new Date(Date.now() - ENGAGEMENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.analyticsEvent.groupBy({
      by: ['productId', 'type'],
      where: {
        productId: { not: null },
        type: { in: Object.keys(ENGAGEMENT_WEIGHTS) as AnalyticsEventType[] },
        createdAt: { gte: since },
      },
      _count: { _all: true },
    });
    if (!rows.length) return [];

    const scores = new Map<string, number>();
    for (const row of rows) {
      if (!row.productId) continue;
      const weight = ENGAGEMENT_WEIGHTS[row.type] ?? 0;
      scores.set(row.productId, (scores.get(row.productId) ?? 0) + row._count._all * weight);
    }
    const rankedIds = [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);

    const eligible = await this.prisma.product.findMany({
      where: { id: { in: rankedIds }, status: 'ACTIVE', stock: { gt: 0 } },
      select: { id: true },
    });
    const eligibleSet = new Set(eligible.map((p) => p.id));
    return rankedIds.filter((id) => eligibleSet.has(id)).slice(0, limit);
  }

  // Compara o preço/promoção salvos junto ao texto gerado com os valores atuais
  // do produto. Se mudou, o texto ficou desatualizado e precisa ser regenerado.
  private priceChanged(
    existing: { price: Prisma.Decimal | null; salePrice: Prisma.Decimal | null },
    product: { price: Prisma.Decimal; salePrice: Prisma.Decimal | null },
  ): boolean {
    if (!existing.price || !existing.price.equals(product.price)) return true;
    if (existing.salePrice === null || product.salePrice === null) {
      return existing.salePrice !== product.salePrice;
    }
    return !existing.salePrice.equals(product.salePrice);
  }

  // Envia UM produto para todos os grupos ativos. Retorna o nome do produto e se
  // ao menos um envio teve sucesso — usado pelo disparo espaçado (1 a cada N min).
  async broadcastSingleProduct(productId: string): Promise<{ ok: boolean; name: string | null }> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        images: { orderBy: { position: 'asc' } },
        category: { select: { name: true } },
      },
    });
    if (!product) return { ok: false, name: null };

    const groups = await this.prisma.whatsappGroup.findMany({ where: { active: true } });
    if (!groups.length) return { ok: false, name: product.name };

    const frontendUrl = (this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000')
      .split(',')[0]
      .trim();
    const productUrl = `${frontendUrl}/produtos/${product.slug}`;

    let message: string;
    try {
      const existing = await this.prisma.whatsappContentHistory.findFirst({
        where: { productId: product.id },
        orderBy: { createdAt: 'desc' },
      });
      if (existing && !this.priceChanged(existing, product)) {
        message = existing.content;
      } else {
        message = await this.ai.generateAdCopy({
          name: product.name,
          category: product.category?.name,
          brand: product.brand ?? undefined,
          price: product.price.toNumber(),
          salePrice: product.salePrice?.toNumber(),
          stock: product.stock,
          description: product.description ?? undefined,
          productUrl,
        });
        await this.prisma.whatsappContentHistory
          .create({
            data: {
              productId: product.id,
              content: message,
              price: product.price,
              salePrice: product.salePrice,
              sent: false,
            },
          })
          .catch(() => {});
      }
    } catch {
      return { ok: false, name: product.name };
    }

    const imageUrl = product.images?.[0]?.url;
    let anySuccess = false;
    for (const group of groups) {
      try {
        const messageId = imageUrl
          ? await this.whatsapp.sendMedia(group.groupId, imageUrl, message)
          : await this.whatsapp.sendMessage(group.groupId, message);
        anySuccess = true;
        await this.prisma.whatsappMessageLog
          .create({ data: { productId: product.id, groupId: group.id, success: true, messageId } })
          .catch(() => {});
      } catch (e) {
        const error = (e as Error).message;
        this.logger.error(`Broadcast ${product.name} → ${group.name}: ${error}`);
        await this.prisma.whatsappMessageLog
          .create({ data: { productId: product.id, groupId: group.id, success: false, error } })
          .catch(() => {});
      }
    }
    return { ok: anySuccess, name: product.name };
  }
}
