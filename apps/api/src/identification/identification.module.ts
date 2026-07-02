import { Module } from '@nestjs/common';
import { OllamaModule } from '../ollama/ollama.module';
import { PrismaModule } from '../prisma/prisma.module';
import { IdentificationController } from './identification.controller';
import { IdentificationService } from './identification.service';

/**
 * IdentificationModule — segunda etapa do Funcionário Virtual. Depende do
 * Ollama (geração de texto) e do Prisma (só leitura, para casar a categoria
 * sugerida com uma `Category` já cadastrada).
 */
@Module({
  imports: [OllamaModule, PrismaModule],
  controllers: [IdentificationController],
  providers: [IdentificationService],
  exports: [IdentificationService],
})
export class IdentificationModule {}
