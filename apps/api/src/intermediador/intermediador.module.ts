import { Module } from '@nestjs/common';
import { IntermediadorService } from './intermediador.service';

@Module({
  providers: [IntermediadorService],
  exports: [IntermediadorService],
})
export class IntermediadorModule {}
