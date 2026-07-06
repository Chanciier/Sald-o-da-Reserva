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
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { AdminSection } from '@prisma/client';
import { InvoiceService } from './invoice.service';
import { QueryInvoiceDto } from './dto/query-invoice.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { AuthenticatedUser } from '../auth/types/auth.types';
import { RequireSection } from '../seller-permissions/decorators/require-section.decorator';

@Controller('invoices')
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  // ── Admin / Vendedor list ─────────────────────────────────────────────────

  @Get()
  @Roles('ADMIN', 'VENDEDOR')
  @RequireSection(AdminSection.FINANCEIRO)
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
  @RequireSection(AdminSection.FINANCEIRO)
  findById(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.invoiceService.findById(id, user);
  }

  // ── Emit ──────────────────────────────────────────────────────────────────

  @Post('emit/:orderId')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  emit(
    @Param('orderId') orderId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body('cpf') cpf?: string,
    @Body('name') name?: string,
  ) {
    return this.invoiceService.emit(orderId, user, cpf || name ? { cpf, name } : undefined);
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
  @RequireSection(AdminSection.FINANCEIRO)
  getXml(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.invoiceService.getXmlUrl(id, user);
  }

  @Get(':id/pdf')
  @Roles('ADMIN', 'VENDEDOR')
  @RequireSection(AdminSection.FINANCEIRO)
  getPdf(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.invoiceService.getDanfeUrl(id, user);
  }

  @Get(':id/danfe')
  @Roles('ADMIN', 'VENDEDOR')
  @RequireSection(AdminSection.FINANCEIRO)
  async getDanfe(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const buffer = await this.invoiceService.streamDanfe(id, user);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="danfe.pdf"');
    res.send(buffer);
  }

  @Get(':id/xml/download')
  @Roles('ADMIN', 'VENDEDOR')
  @RequireSection(AdminSection.FINANCEIRO)
  async getXmlDownload(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const buffer = await this.invoiceService.streamXml(id, user);
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', 'attachment; filename="nfe.xml"');
    res.send(buffer);
  }

  // ── Sync ──────────────────────────────────────────────────────────────────

  @Post(':id/sync')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  sync(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.invoiceService.syncStatus(id, user);
  }

  // ── Focus NFe webhook (public) ────────────────────────────────────────────

  @Post('webhook/focusnfe')
  @Public()
  @HttpCode(HttpStatus.OK)
  focusWebhook(@Body() body: Record<string, unknown>) {
    return this.invoiceService.handleWebhook(body);
  }
}
