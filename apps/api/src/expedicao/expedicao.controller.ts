import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/types/auth.types';
import { ExpedicaoService } from './expedicao.service';

@Controller('expedicao')
@Roles(Role.ADMIN, Role.VENDEDOR)
export class ExpedicaoController {
  constructor(private readonly expedicaoService: ExpedicaoService) {}

  private resolveUserId(user: AuthenticatedUser): string | null {
    return user.role === Role.ADMIN ? null : user.id;
  }

  @Get('stats')
  getStats(@CurrentUser() user: AuthenticatedUser) {
    return this.expedicaoService.getStats(this.resolveUserId(user));
  }

  @Get('fila')
  getFila(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page = '1',
    @Query('search') search?: string,
    @Query('deliveryMethod') deliveryMethod?: string,
  ) {
    return this.expedicaoService.getFila({
      page: parseInt(page, 10) || 1,
      search,
      deliveryMethod,
      userId: this.resolveUserId(user),
    });
  }

  @Get('separacao')
  getSeparacao(@CurrentUser() user: AuthenticatedUser, @Query('page') page = '1') {
    return this.expedicaoService.getSeparacao({
      page: parseInt(page, 10) || 1,
      userId: this.resolveUserId(user),
    });
  }

  @Get('prontos')
  getProntos(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page = '1',
    @Query('deliveryMethod') deliveryMethod?: string,
  ) {
    return this.expedicaoService.getProntos({
      page: parseInt(page, 10) || 1,
      deliveryMethod,
      userId: this.resolveUserId(user),
    });
  }

  @Get('enviados')
  getEnviados(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page = '1',
    @Query('search') search?: string,
  ) {
    return this.expedicaoService.getEnviados({
      page: parseInt(page, 10) || 1,
      search,
      userId: this.resolveUserId(user),
    });
  }

  @Get('retirada')
  getRetirada(@CurrentUser() user: AuthenticatedUser, @Query('page') page = '1') {
    return this.expedicaoService.getRetirada({
      page: parseInt(page, 10) || 1,
      userId: this.resolveUserId(user),
    });
  }

  @Get('concluidos')
  getConcluidos(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page = '1',
    @Query('search') search?: string,
  ) {
    return this.expedicaoService.getConcluidos({
      page: parseInt(page, 10) || 1,
      search,
      userId: this.resolveUserId(user),
    });
  }

  @Patch(':id/iniciar-separacao')
  iniciarSeparacao(@Param('id') id: string) {
    return this.expedicaoService.iniciarSeparacao(id);
  }

  @Patch(':id/itens-separados')
  atualizarItensSeparados(@Param('id') id: string, @Body() body: { separatedItems: string[] }) {
    return this.expedicaoService.atualizarItensSeparados(id, body.separatedItems);
  }

  @Patch(':id/finalizar-separacao')
  finalizarSeparacao(@Param('id') id: string) {
    return this.expedicaoService.finalizarSeparacao(id);
  }

  @Patch(':id/marcar-pronto')
  marcarPronto(@Param('id') id: string) {
    return this.expedicaoService.marcarPronto(id);
  }

  @Patch(':id/confirmar-retirada')
  confirmarRetirada(@Param('id') id: string) {
    return this.expedicaoService.confirmarRetirada(id);
  }

  @Post('batch')
  batchAction(@Body() body: { ids: string[]; action: string }) {
    return this.expedicaoService.batchAction(body.ids, body.action);
  }
}
