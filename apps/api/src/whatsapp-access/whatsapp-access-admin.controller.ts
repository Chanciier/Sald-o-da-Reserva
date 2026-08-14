import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { AdminSection, Role, WhatsappAccessGrantStatus } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequireSection } from '../seller-permissions/decorators/require-section.decorator';
import { WhatsappAccessService } from './whatsapp-access.service';

@Controller('admin/whatsapp-access')
@Roles(Role.ADMIN, Role.VENDEDOR)
@RequireSection(AdminSection.PEDIDOS)
export class WhatsappAccessAdminController {
  constructor(private readonly whatsappAccess: WhatsappAccessService) {}

  @Get()
  list(@Query('page') page?: string, @Query('status') status?: WhatsappAccessGrantStatus) {
    return this.whatsappAccess.list({
      page: page ? parseInt(page, 10) : 1,
      status: status || undefined,
    });
  }

  @Post(':id/resend')
  @HttpCode(HttpStatus.OK)
  resend(@Param('id') id: string) {
    return this.whatsappAccess.resend(id);
  }

  @Post(':id/remove')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string) {
    return this.whatsappAccess.forceRemove(id);
  }
}
