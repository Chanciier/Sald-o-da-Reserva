import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { InvoiceService } from './invoice.service';
import { QueryInvoiceDto } from './dto/query-invoice.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { AuthenticatedUser } from '../auth/types/auth.types';

@Controller('invoices')
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  // ── Admin list ────────────────────────────────────────────────────────────

  @Get()
  @Roles('ADMIN', 'VENDEDOR')
  findAll(@Query() query: QueryInvoiceDto, @CurrentUser() user: AuthenticatedUser) {
    return this.invoiceService.findAll(query, user);
  }

  @Get('stats')
  @Roles('ADMIN')
  stats() {
    return this.invoiceService.stats();
  }

  @Get(':id')
  @Roles('ADMIN', 'VENDEDOR')
  findById(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.invoiceService.findById(id, user);
  }

  // ── Emit ──────────────────────────────────────────────────────────────────

  @Post('emit/:orderId')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  emit(@Param('orderId') orderId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.invoiceService.emit(orderId, user);
  }

  @Post(':id/reemit')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  reemit(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.invoiceService.reemit(id, user);
  }

  // ── Cancel ────────────────────────────────────────────────────────────────

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  cancel(
    @Param('id') id: string,
    @Body('reason') reason: string = 'Cancelamento solicitado pelo administrador.',
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.invoiceService.cancel(id, reason, user);
  }

  // ── Downloads ─────────────────────────────────────────────────────────────

  @Get(':id/xml')
  @Roles('ADMIN', 'VENDEDOR')
  getXml(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.invoiceService.getXmlUrl(id, user);
  }

  @Get(':id/pdf')
  @Roles('ADMIN', 'VENDEDOR')
  getPdf(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.invoiceService.getPdfUrl(id, user);
  }

  // ── Sync ──────────────────────────────────────────────────────────────────

  @Post(':id/sync')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  sync(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.invoiceService.syncStatus(id, user);
  }

  // ── eNotas webhook (public) ───────────────────────────────────────────────

  @Post('webhook/enotas')
  @Public()
  @HttpCode(HttpStatus.OK)
  enotasWebhook(@Body() body: Record<string, unknown>) {
    return this.invoiceService.handleWebhook(body);
  }
}
