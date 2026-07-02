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
  getSeparacao(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page = '1',
    @Query('deliveryMethod') deliveryMethod?: string,
  ) {
    return this.expedicaoService.getSeparacao({
      page: parseInt(page, 10) || 1,
      deliveryMethod,
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
  getRetirada(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page = '1',
    @Query('grupo') grupo?: string,
    @Query('search') search?: string,
  ) {
    return this.expedicaoService.getRetirada({
      page: parseInt(page, 10) || 1,
      userId: this.resolveUserId(user),
      grupo: grupo as 'separados' | 'prontos' | undefined,
      search,
    });
  }

  @Get('concluidos')
  getConcluidos(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page = '1',
    @Query('search') search?: string,
    @Query('deliveryMethod') deliveryMethod?: string,
  ) {
    return this.expedicaoService.getConcluidos({
      page: parseInt(page, 10) || 1,
      search,
      deliveryMethod,
      userId: this.resolveUserId(user),
    });
  }

  // Detalhe de um pedido (itens + imagens, linha do tempo, remessa). Declarado
  // após as rotas literais acima para não capturá-las como :id.
  @Get(':id')
  getOrderDetail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.expedicaoService.getOrderDetail(id, this.resolveUserId(user));
  }

  @Patch(':id/iniciar-separacao')
  iniciarSeparacao(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.expedicaoService.iniciarSeparacao(id, user.email);
  }

  @Patch(':id/itens-separados')
  atualizarItensSeparados(@Param('id') id: string, @Body() body: { separatedItems: string[] }) {
    return this.expedicaoService.atualizarItensSeparados(id, body.separatedItems);
  }

  @Patch(':id/observacao')
  atualizarObservacao(@Param('id') id: string, @Body() body: { separationNotes: string }) {
    return this.expedicaoService.atualizarObservacao(id, body.separationNotes ?? '');
  }

  @Patch(':id/finalizar-separacao')
  finalizarSeparacao(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.expedicaoService.finalizarSeparacao(id, user.email);
  }

  @Patch(':id/marcar-pronto')
  marcarPronto(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.expedicaoService.marcarPronto(id, user.email);
  }

  @Patch(':id/marcar-enviado')
  marcarEnviado(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.expedicaoService.marcarEnviado(id, user.email);
  }

  @Patch(':id/confirmar-retirada')
  confirmarRetirada(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.expedicaoService.confirmarRetirada(id, user.email);
  }

  @Patch(':id/cancelar')
  cancelarPedido(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.expedicaoService.cancelarPedido(id, user.email);
  }

  @Post('batch')
  batchAction(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { ids: string[]; action: string },
  ) {
    return this.expedicaoService.batchAction(body.ids, body.action, user.email);
  }
}
