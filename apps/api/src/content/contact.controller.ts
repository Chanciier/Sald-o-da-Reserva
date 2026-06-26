import { Body, Controller, Ip, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { MailService } from '../mail/mail.service';
import { ContactFormDto } from './dto/contact-form.dto';

@Controller('content/contact')
export class ContactController {
  constructor(private readonly mail: MailService) {}

  @Public()
  @Post()
  // Anti-spam/mail-bombing: no máx. 5 envios por hora por IP.
  @Throttle({ medium: { limit: 5, ttl: 3_600_000 } })
  async send(@Body() dto: ContactFormDto, @Ip() ip: string) {
    await this.mail.sendContactEmail(dto, ip);
    return { ok: true };
  }
}
