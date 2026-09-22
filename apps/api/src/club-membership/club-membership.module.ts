import { Module } from '@nestjs/common';
import { IntermediadorModule } from '../intermediador/intermediador.module';
import { ClubMembershipService } from './club-membership.service';

@Module({
  imports: [IntermediadorModule],
  providers: [ClubMembershipService],
})
export class ClubMembershipModule {}
