import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/types/auth.types';
import { PrintJobsService } from './print-jobs.service';
import { PrintCenterService } from './print-center.service';
import { QueryPrintJobsDto } from './dto/query-print-jobs.dto';

@Controller('print-center/jobs')
@Roles(Role.ADMIN, Role.VENDEDOR)
export class PrintJobsController {
  constructor(
    private readonly printJobs: PrintJobsService,
    private readonly printCenter: PrintCenterService,
  ) {}

  @Get()
  list(@Query() query: QueryPrintJobsDto) {
    return this.printJobs.list(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.printJobs.findOne(id);
  }

  @Post(':id/reprint')
  reprint(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.printJobs.reprint(id, user.email);
  }

  // Fallback manual (flags desligadas, pedido antigo, etc.) — mesma lógica do
  // listener de order.paid, só que sem checar as feature flags.
  @Post('manual/:orderId')
  createManual(@Param('orderId') orderId: string) {
    return this.printCenter.createManual(orderId);
  }
}
