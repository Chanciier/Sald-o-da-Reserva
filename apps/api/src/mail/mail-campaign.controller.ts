import { BadRequestException, Controller, Get, Param, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CAMPAIGN_KEYS, CampaignKey, MailCampaignService } from './mail-campaign.service';

@Controller('mail-campaigns')
@Roles(Role.ADMIN)
export class MailCampaignController {
  constructor(private readonly campaigns: MailCampaignService) {}

  @Get(':key/status')
  status(@Param('key') key: string) {
    return this.campaigns.getStatus(this.assertKnown(key));
  }

  @Get(':key/recipient-count')
  async recipientCount(@Param('key') key: string) {
    this.assertKnown(key);
    return { count: await this.campaigns.recipientCount() };
  }

  @Post(':key/send')
  send(@Param('key') key: string) {
    return this.campaigns.send(this.assertKnown(key));
  }

  private assertKnown(key: string): CampaignKey {
    if (!(CAMPAIGN_KEYS as readonly string[]).includes(key)) {
      throw new BadRequestException('Campanha desconhecida.');
    }
    return key as CampaignKey;
  }
}
