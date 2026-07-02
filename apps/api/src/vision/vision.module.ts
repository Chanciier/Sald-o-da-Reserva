import { Module } from '@nestjs/common';
import { AnthropicModule } from '../anthropic/anthropic.module';
import { VisionController } from './vision.controller';
import { VisionService } from './vision.service';

/**
 * VisionModule — primeira etapa do Funcionário Virtual. Extrai atributos
 * visuais de fotos de produto usando Claude Vision (API da Anthropic).
 * Sem dependências de banco internas: fala com a Anthropic (via AnthropicModule)
 * e (opcional) baixa imagens públicas. Exporta o serviço para uso pelo pipeline.
 */
@Module({
  imports: [AnthropicModule],
  controllers: [VisionController],
  providers: [VisionService],
  exports: [VisionService],
})
export class VisionModule {}
