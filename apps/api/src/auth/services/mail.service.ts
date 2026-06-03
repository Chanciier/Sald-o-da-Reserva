import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly configService: ConfigService) {}

  async sendPasswordResetEmail(email: string, token: string, name?: string): Promise<void> {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');
    const resetUrl = `${frontendUrl}/auth/reset-password?token=${token}`;
    const greeting = name ? `Olá, ${name}!` : 'Olá!';

    // TODO: Integrate with email provider (Resend, SendGrid, Nodemailer, etc.)
    // Example with Resend:
    // await resend.emails.send({
    //   from: 'noreply@saldaodareserva.com',
    //   to: email,
    //   subject: 'Recuperação de senha',
    //   html: `<p>${greeting}</p><p>Acesse: <a href="${resetUrl}">${resetUrl}</a></p>`
    // });

    this.logger.log(`[DEV] Password reset for ${email} → ${resetUrl}`);

    void greeting; // suppress unused warning until real implementation
  }
}
