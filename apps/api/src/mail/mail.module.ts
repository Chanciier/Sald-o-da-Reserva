import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { MailCampaignService } from './mail-campaign.service';
import { MailCampaignController } from './mail-campaign.controller';

@Global()
@Module({
  controllers: [MailCampaignController],
  providers: [MailService, MailCampaignService],
  exports: [MailService],
})
export class MailModule {}
