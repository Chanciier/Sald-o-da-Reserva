import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StockModule } from '../stock/stock.module';
import { IntermediadorModule } from '../intermediador/intermediador.module';
import { ClubSignupService } from './club-signup.service';
import { ClubSignupController } from './club-signup.controller';

@Module({
  imports: [AuthModule, StockModule, IntermediadorModule],
  controllers: [ClubSignupController],
  providers: [ClubSignupService],
})
export class ClubSignupModule {}
