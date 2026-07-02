import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/types/auth.types';
import { VirtualEmployeeAnalyzeDto } from './dto/analyze.dto';
import { VirtualEmployeeApproveDto } from './dto/approve.dto';
import { VirtualEmployeeService } from './virtual-employee.service';
import { VirtualEmployeeReview } from './virtual-employee.types';

@Controller('virtual-employee')
@Roles(Role.ADMIN, Role.VENDEDOR)
export class VirtualEmployeeController {
  constructor(private readonly virtualEmployee: VirtualEmployeeService) {}

  /**
   * Operador só fotografa e envia as fotos. Devolve o painel único: produto
   * identificado, confiança, preço sugerido (+ 3 estratégias), preços por
   * marketplace, concorrência, categoria e NCM. Nada é persistido ainda.
   */
  @Post('analyze')
  analyze(@Body() dto: VirtualEmployeeAnalyzeDto): Promise<VirtualEmployeeReview> {
    return this.virtualEmployee.analyze(dto);
  }

  /** Operador aprova (ou aprova com edições) → cria o produto de verdade. */
  @Post('approve')
  @HttpCode(HttpStatus.CREATED)
  approve(@Body() dto: VirtualEmployeeApproveDto, @CurrentUser() user: AuthenticatedUser) {
    return this.virtualEmployee.approve(dto, user.id);
  }
}
