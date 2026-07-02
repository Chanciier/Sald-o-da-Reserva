import { Body, Controller, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { IdentifyProductDto } from './dto/identify-product.dto';
import { IdentificationService } from './identification.service';
import { IdentificationResult } from './identification.types';

@Controller('identification')
export class IdentificationController {
  constructor(private readonly identificationService: IdentificationService) {}

  /**
   * Gera título SEO, descrição, especificações, categoria, tags, slug e meta
   * description a partir do JSON devolvido por `POST /vision/analyze`. Nada é
   * persistido — o resultado alimenta o painel de revisão.
   */
  @Post('generate')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  generate(@Body() dto: IdentifyProductDto): Promise<IdentificationResult> {
    return this.identificationService.generate(dto);
  }
}
