import { Body, Controller, Get, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { MailCampaignService } from './mail-campaign.service';
import { SendAnnouncementDto } from './dto/send-announcement.dto';

@Controller('mail-campaigns')
@Roles(Role.ADMIN)
export class MailCampaignController {
  constructor(private readonly campaigns: MailCampaignService) {}

  @Get('status')
  status() {
    return this.campaigns.getStatus();
  }

  @Get('recipient-count')
  async recipientCount() {
    return { count: await this.campaigns.recipientCount() };
  }

  @Post('send')
  send(@Body() dto: SendAnnouncementDto) {
    return this.campaigns.send(dto.subject, dto.message);
  }
}
