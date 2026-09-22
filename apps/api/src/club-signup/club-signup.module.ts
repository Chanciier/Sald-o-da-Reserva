import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StockModule } from '../stock/stock.module';
import { ClubSignupService } from './club-signup.service';
import { ClubSignupController } from './club-signup.controller';

@Module({
  imports: [AuthModule, StockModule],
  controllers: [ClubSignupController],
  providers: [ClubSignupService],
})
export class ClubSignupModule {}
