import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { LegalPagesService } from './legal-pages.service';
import { UpdateLegalPageDto } from './dto/update-legal-page.dto';

@Controller('content/pages')
export class LegalPagesController {
  constructor(private readonly service: LegalPagesService) {}

  @Public()
  @Get(':slug')
  getBySlug(@Param('slug') slug: string, @Query('draft') draft?: string) {
    return this.service.findBySlug(slug, draft === 'true');
  }

  @Roles(Role.ADMIN)
  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Roles(Role.ADMIN)
  @Put(':slug')
  update(@Param('slug') slug: string, @Body() dto: UpdateLegalPageDto) {
    return this.service.update(slug, dto);
  }
}
