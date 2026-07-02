import { Module } from '@nestjs/common';
import { AnthropicModule } from '../anthropic/anthropic.module';
import { PrismaModule } from '../prisma/prisma.module';
import { IdentificationController } from './identification.controller';
import { IdentificationService } from './identification.service';

/**
 * IdentificationModule — segunda etapa do Funcionário Virtual. Depende da
 * Anthropic (geração de texto) e do Prisma (só leitura, para casar a categoria
 * sugerida com uma `Category` já cadastrada).
 */
@Module({
  imports: [AnthropicModule, PrismaModule],
  controllers: [IdentificationController],
  providers: [IdentificationService],
  exports: [IdentificationService],
})
export class IdentificationModule {}
