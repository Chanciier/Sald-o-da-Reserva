import { Body, Controller, Ip, Post } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { MailService } from '../mail/mail.service';
import { ContactFormDto } from './dto/contact-form.dto';

@Controller('content/contact')
export class ContactController {
  constructor(private readonly mail: MailService) {}

  @Public()
  @Post()
  async send(@Body() dto: ContactFormDto, @Ip() ip: string) {
    await this.mail.sendContactEmail(dto, ip);
    return { ok: true };
  }
}
