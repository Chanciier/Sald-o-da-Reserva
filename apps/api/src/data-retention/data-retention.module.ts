import { Module } from '@nestjs/common';
import { DataRetentionService } from './data-retention.service';

@Module({
  providers: [DataRetentionService],
})
export class DataRetentionModule {}
