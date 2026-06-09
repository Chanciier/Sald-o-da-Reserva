import {
  ConflictException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByProduct(productId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    const [total, data] = await Promise.all([
      this.prisma.review.count({ where: { productId } }),
      this.prisma.review.findMany({
        where: { productId },
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const sum = await this.prisma.review.aggregate({
      where: { productId },
      _avg: { rating: true },
      _count: { rating: true },
    });

    return {
      data,
      total,
      page,
      pages: Math.ceil(total / limit),
      averageRating: sum._avg.rating ? Number(sum._avg.rating.toFixed(1)) : null,
      totalRatings: sum._count.rating,
    };
  }

  async create(productId: string, userId: string, dto: CreateReviewDto) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Produto não encontrado.');

    const existing = await this.prisma.review.findUnique({
      where: { productId_userId: { productId, userId } },
    });
    if (existing) throw new ConflictException('Você já avaliou este produto.');

    return this.prisma.review.create({
      data: { productId, userId, rating: dto.rating, comment: dto.comment },
      include: { user: { select: { id: true, name: true } } },
    });
  }

  async remove(reviewId: string, userId: string, isAdmin: boolean) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Avaliação não encontrada.');
    if (!isAdmin && review.userId !== userId) {
      throw new ForbiddenException('Você só pode excluir suas próprias avaliações.');
    }
    await this.prisma.review.delete({ where: { id: reviewId } });
    return { message: 'Avaliação removida.' };
  }
}
