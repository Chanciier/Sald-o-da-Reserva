import { Controller, Get, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { CommunityService } from './community.service';
import { JoinCommunityDto } from './dto/join-community.dto';

@Controller('community')
export class CommunityController {
  constructor(private readonly community: CommunityService) {}

  // Endpoint público por trás dos links /grupos e /grupos/<categoria>: devolve
  // o grupo da categoria com menor ocupação (ou available=false quando todos
  // estão lotados). Nunca
  // toca o WhatsApp na requisição — só banco + cache.
  @Public()
  @Get('join')
  @Throttle({ medium: { limit: 30, ttl: 60_000 } })
  join(@Query() dto: JoinCommunityDto) {
    return this.community.join(dto);
  }
}
