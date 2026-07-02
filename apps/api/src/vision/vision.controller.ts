import { Body, Controller, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { AnalyzeVisionDto } from './dto/analyze-vision.dto';
import { VisionService } from './vision.service';
import { VisionResult } from './vision.types';

@Controller('vision')
export class VisionController {
  constructor(private readonly visionService: VisionService) {}

  /**
   * Analisa 1..5 fotos de um produto com o modelo local (Qwen2.5-VL / Ollama)
   * e devolve os atributos visuais estruturados. Restrito a staff, como o
   * endpoint de cadastro de produtos.
   */
  @Post('analyze')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  analyze(@Body() dto: AnalyzeVisionDto): Promise<VisionResult> {
    return this.visionService.analyze(dto);
  }
}
