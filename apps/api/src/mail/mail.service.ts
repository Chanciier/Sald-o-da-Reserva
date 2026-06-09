import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend | null;
  private readonly from: string;
  private readonly frontendUrl: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('RESEND_API_KEY', '');
    this.from = this.config.get<string>('RESEND_FROM_EMAIL', 'noreply@saldaodareserva.com.br');
    this.frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:3000');
    this.resend = apiKey ? new Resend(apiKey) : null;
    if (!apiKey) this.logger.warn('RESEND_API_KEY não configurado — e-mails apenas logados.');
  }

  async sendReturnApprovedEmail(
    email: string,
    name: string | undefined,
    orderId: string,
    labelUrl: string | null,
  ): Promise<void> {
    const greeting = name ? `Olá, ${name}!` : 'Olá!';
    const shortId = orderId.slice(-8).toUpperCase();
    const subject = `Sua devolução foi aprovada — Pedido #${shortId}`;

    const html = `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
        <div style="background:#f5f5f5;padding:24px 32px;border-radius:12px 12px 0 0">
          <h1 style="margin:0;font-size:20px;color:#1a1a1a">Saldão da Reserva</h1>
        </div>
        <div style="padding:32px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 12px 12px">
          <p style="margin:0 0 16px">${greeting}</p>
          <p style="margin:0 0 16px">Sua solicitação de devolução do pedido <strong>#${shortId}</strong> foi <strong>aprovada</strong>.</p>
          ${
            labelUrl
              ? `
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:24px 0">
            <p style="margin:0 0 8px;font-weight:600;color:#166534">Etiqueta de devolução disponível</p>
            <p style="margin:0 0 12px;font-size:14px;color:#15803d">Imprima a etiqueta abaixo e leve o pacote a uma agência dos Correios.</p>
            <a href="${labelUrl}" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:600">
              Imprimir etiqueta de devolução
            </a>
          </div>
          `
              : `
          <p style="margin:16px 0;font-size:14px;color:#666">Nossa equipe entrará em contato com as instruções para envio do produto.</p>
          `
          }
          <p style="margin:16px 0 0;font-size:14px;color:#666">Após recebermos o produto, seu reembolso será processado em até 5 dias úteis.</p>
          <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0">
          <p style="margin:0;font-size:12px;color:#999">Saldão da Reserva · Este é um e-mail automático, não responda.</p>
        </div>
      </div>
    `;

    await this.send({ to: email, subject, html });
  }

  async sendRefundProcessedEmail(
    email: string,
    name: string | undefined,
    orderId: string,
    amount: number,
    refundId: string,
  ): Promise<void> {
    const greeting = name ? `Olá, ${name}!` : 'Olá!';
    const shortId = orderId.slice(-8).toUpperCase();
    const fmtAmount = amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const subject = `Reembolso processado — Pedido #${shortId}`;
    const ordersUrl = `${this.frontendUrl}/pedidos/${orderId}`;

    const html = `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
        <div style="background:#f5f5f5;padding:24px 32px;border-radius:12px 12px 0 0">
          <h1 style="margin:0;font-size:20px;color:#1a1a1a">Saldão da Reserva</h1>
        </div>
        <div style="padding:32px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 12px 12px">
          <p style="margin:0 0 16px">${greeting}</p>
          <p style="margin:0 0 16px">Recebemos o produto do pedido <strong>#${shortId}</strong> e seu reembolso foi processado com sucesso.</p>
          <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:20px;margin:24px 0">
            <div style="display:flex;justify-content:space-between;margin-bottom:8px">
              <span style="font-size:14px;color:#3b82f6">Valor reembolsado</span>
              <strong style="font-size:18px;color:#1d4ed8">${fmtAmount}</strong>
            </div>
            <p style="margin:8px 0 0;font-size:12px;color:#60a5fa">ID do reembolso: ${refundId}</p>
          </div>
          <p style="margin:0 0 16px;font-size:14px;color:#444">O valor será estornado em sua forma de pagamento original em <strong>até 10 dias úteis</strong>, dependendo da operadora.</p>
          <a href="${ordersUrl}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:600">
            Ver detalhes do pedido
          </a>
          <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0">
          <p style="margin:0;font-size:12px;color:#999">Saldão da Reserva · Este é um e-mail automático, não responda.</p>
        </div>
      </div>
    `;

    await this.send({ to: email, subject, html });
  }

  private async send(opts: { to: string; subject: string; html: string }): Promise<void> {
    if (!this.resend) {
      this.logger.log(`[DEV] Email to ${opts.to} | ${opts.subject}`);
      return;
    }
    try {
      await this.resend.emails.send({
        from: `Saldão da Reserva <${this.from}>`,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
      });
    } catch (err) {
      this.logger.error(`Failed to send email to ${opts.to}: ${(err as Error).message}`);
    }
  }
}
