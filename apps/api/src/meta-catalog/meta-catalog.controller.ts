import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { MetaCatalogService } from './meta-catalog.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('api/v1/admin/meta-catalog')
@UseGuards(JwtAuthGuard)
@Roles(Role.ADMIN)
export class MetaCatalogController {
  constructor(private readonly catalog: MetaCatalogService) {}

  @Get('stats')
  getStats() {
    return this.catalog.getStats();
  }

  @Post('sync')
  async syncAll() {
    const result = await this.catalog.syncAll();
    return { ...result, message: `Sincronização concluída: ${result.synced} ok, ${result.errors} erros` };
  }
}
