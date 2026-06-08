import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ExpedicaoController } from './expedicao.controller';
import { ExpedicaoService } from './expedicao.service';

@Module({
  imports: [PrismaModule],
  controllers: [ExpedicaoController],
  providers: [ExpedicaoService],
})
export class ExpedicaoModule {}
