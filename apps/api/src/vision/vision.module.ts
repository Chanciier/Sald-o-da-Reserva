import { Module } from '@nestjs/common';
import { OllamaModule } from '../ollama/ollama.module';
import { VisionController } from './vision.controller';
import { VisionService } from './vision.service';

/**
 * VisionModule — primeira etapa do Funcionário Virtual. Extrai atributos
 * visuais de fotos de produto usando um modelo LOCAL (Qwen2.5-VL via Ollama).
 * Sem dependências de banco internas: fala com o Ollama (via OllamaModule) e
 * (opcional) baixa imagens públicas. Exporta o serviço para uso pelo pipeline.
 */
@Module({
  imports: [OllamaModule],
  controllers: [VisionController],
  providers: [VisionService],
  exports: [VisionService],
})
export class VisionModule {}
