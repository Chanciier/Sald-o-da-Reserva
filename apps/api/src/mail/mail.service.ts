import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend | null;
  private readonly smtp: nodemailer.Transporter | null;
  private readonly from: string;
  private readonly frontendUrl: string;

  constructor(private readonly config: ConfigService) {
    const resendKey = this.config.get<string>('RESEND_API_KEY', '');
    const smtpUser = this.config.get<string>('SMTP_USER', '');
    const smtpPass = this.config.get<string>('SMTP_PASS', '');

    this.from = this.config.get<string>(
      'SMTP_FROM',
      this.config.get<string>('RESEND_FROM_EMAIL', 'noreply@saldaodareserva.com.br'),
    );
    this.frontendUrl = this.config
      .get<string>('FRONTEND_URL', 'http://localhost:3000')
      .split(',')[0]
      .trim();

    this.resend = resendKey && !resendKey.startsWith('re_REPLACE') ? new Resend(resendKey) : null;

    this.smtp =
      smtpUser && smtpPass
        ? nodemailer.createTransport({
            host: this.config.get<string>('SMTP_HOST', 'smtp.gmail.com'),
            port: this.config.get<number>('SMTP_PORT', 587),
            secure: false,
            auth: { user: smtpUser, pass: smtpPass },
          })
        : null;

    if (!this.resend && !this.smtp) {
      this.logger.warn('Nenhum provedor de e-mail configurado — e-mails apenas logados.');
    } else if (this.smtp) {
      this.logger.log(`MailService: usando SMTP (${smtpUser})`);
    } else {
      this.logger.log('MailService: usando Resend');
    }
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  async sendPasswordResetEmail(email: string, token: string, name?: string): Promise<void> {
    const resetUrl = `${this.frontendUrl}/auth/reset-password?token=${token}`;
    const greeting = name ? `Olá, ${name.split(' ')[0]}!` : 'Olá!';
    const subject = 'Recuperação de senha — Saldão da Reserva';

    const html = `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
        <div style="background:#f5f5f5;padding:24px 32px;border-radius:12px 12px 0 0">
          <h1 style="margin:0;font-size:20px;color:#1a1a1a">Saldão da Reserva</h1>
        </div>
        <div style="padding:32px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 12px 12px">
          <p style="margin:0 0 16px">${greeting}</p>
          <p style="margin:0 0 24px">Recebemos uma solicitação para redefinir a senha da sua conta. Clique no botão abaixo para continuar:</p>
          <a href="${resetUrl}" style="display:inline-block;background:#f59e0b;color:#1a1a1a;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:700">
            Redefinir minha senha
          </a>
          <p style="margin:24px 0 0;font-size:13px;color:#666">
            Se você não solicitou isso, ignore este e-mail — sua senha permanece a mesma.<br>
            O link expira em <strong>1 hora</strong>.
          </p>
          <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0">
          <p style="margin:0;font-size:12px;color:#999">Saldão da Reserva · Este é um e-mail automático, não responda.</p>
        </div>
      </div>
    `;

    await this.send({ to: email, subject, html });
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async sendOrderConfirmedEmail(
    email: string,
    name: string | null | undefined,
    orderId: string,
    total: number,
  ): Promise<void> {
    const greeting = name ? `Olá, ${name.split(' ')[0]}!` : 'Olá!';
    const shortId = orderId.slice(-8).toUpperCase();
    const fmtTotal = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const orderUrl = `${this.frontendUrl}/pedidos/${orderId}`;
    const subject = `Pedido confirmado #${shortId} — Saldão da Reserva`;

    const html = `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
        <div style="background:#f5f5f5;padding:24px 32px;border-radius:12px 12px 0 0">
          <h1 style="margin:0;font-size:20px;color:#1a1a1a">Saldão da Reserva</h1>
        </div>
        <div style="padding:32px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 12px 12px">
          <p style="margin:0 0 8px">${greeting}</p>
          <p style="margin:0 0 24px">Recebemos seu pagamento e seu pedido está confirmado! 🎉</p>
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;margin:0 0 24px">
            <p style="margin:0 0 6px;font-size:13px;color:#166534">Número do pedido</p>
            <p style="margin:0 0 12px;font-size:20px;font-weight:700;color:#15803d">#${shortId}</p>
            <p style="margin:0;font-size:14px;color:#166534">Total pago: <strong>${fmtTotal}</strong></p>
          </div>
          <p style="margin:0 0 16px;font-size:14px;color:#444">Estamos preparando seu pedido. Você receberá um novo e-mail com o código de rastreamento assim que for enviado.</p>
          <a href="${orderUrl}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:600">
            Acompanhar pedido
          </a>
          <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0">
          <p style="margin:0;font-size:12px;color:#999">Saldão da Reserva · Este é um e-mail automático, não responda.</p>
        </div>
      </div>
    `;

    await this.send({ to: email, subject, html });
  }

  async sendOrderShippedEmail(
    email: string,
    name: string | null | undefined,
    orderId: string,
    trackingCode?: string | null,
    trackingUrl?: string | null,
  ): Promise<void> {
    const greeting = name ? `Olá, ${name.split(' ')[0]}!` : 'Olá!';
    const shortId = orderId.slice(-8).toUpperCase();
    const orderUrl = `${this.frontendUrl}/cliente/rastreamento`;
    const subject = `Seu pedido foi enviado #${shortId} — Saldão da Reserva`;

    const html = `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
        <div style="background:#f5f5f5;padding:24px 32px;border-radius:12px 12px 0 0">
          <h1 style="margin:0;font-size:20px;color:#1a1a1a">Saldão da Reserva</h1>
        </div>
        <div style="padding:32px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 12px 12px">
          <p style="margin:0 0 8px">${greeting}</p>
          <p style="margin:0 0 24px">Seu pedido <strong>#${shortId}</strong> foi enviado e está a caminho! 📦</p>
          ${
            trackingCode
              ? `
          <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:20px;margin:0 0 24px">
            <p style="margin:0 0 6px;font-size:13px;color:#1d4ed8">Código de rastreamento</p>
            <p style="margin:0;font-size:18px;font-weight:700;color:#1e40af;letter-spacing:2px">${trackingCode}</p>
          </div>
          `
              : ''
          }
          ${
            trackingUrl
              ? `<a href="${trackingUrl}" style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:600;margin-bottom:16px">
              Rastrear pelo site dos Correios
            </a><br>`
              : ''
          }
          <a href="${orderUrl}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:600">
            Ver rastreamento
          </a>
          <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0">
          <p style="margin:0;font-size:12px;color:#999">Saldão da Reserva · Este é um e-mail automático, não responda.</p>
        </div>
      </div>
    `;

    await this.send({ to: email, subject, html });
  }

  // ── Invoice ───────────────────────────────────────────────────────────────

  async sendInvoiceEmail(
    email: string,
    name: string | null | undefined,
    danfeUrl: string,
    xmlUrl?: string | null,
    invoiceNumber?: string | null,
    accessKey?: string | null,
  ): Promise<void> {
    const greeting = name ? `Olá, ${name.split(' ')[0]}!` : 'Olá!';
    const subject = 'Sua Nota Fiscal está disponível — Saldão da Reserva';

    const html = `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
        <div style="background:#f5f5f5;padding:24px 32px;border-radius:12px 12px 0 0">
          <h1 style="margin:0;font-size:20px;color:#1a1a1a">Saldão da Reserva</h1>
        </div>
        <div style="padding:32px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 12px 12px">
          <p style="margin:0 0 8px">${greeting}</p>
          <p style="margin:0 0 16px">Sua Nota Fiscal Eletrônica foi emitida e autorizada pela SEFAZ.</p>
          ${invoiceNumber ? `<p style="margin:4px 0"><strong>Número NF-e:</strong> ${invoiceNumber}</p>` : ''}
          ${accessKey ? `<p style="margin:4px 0;font-size:12px;color:#555;word-break:break-all"><strong>Chave de acesso:</strong> ${accessKey}</p>` : ''}
          <div style="margin:24px 0;display:flex;gap:8px;flex-wrap:wrap">
            <a href="${danfeUrl}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:600">
              Baixar DANFE (PDF)
            </a>
            ${xmlUrl ? `<a href="${xmlUrl}" style="display:inline-block;background:#444;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:600">Baixar XML</a>` : ''}
          </div>
          <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0">
          <p style="margin:0;font-size:12px;color:#999">Saldão da Reserva · Este é um e-mail automático, não responda.</p>
        </div>
      </div>
    `;

    await this.send({ to: email, subject, html });
  }

  // ── Returns ───────────────────────────────────────────────────────────────

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
              : `<p style="margin:16px 0;font-size:14px;color:#666">Nossa equipe entrará em contato com as instruções para envio do produto.</p>`
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

  // ── Contact ───────────────────────────────────────────────────────────────

  async sendContactEmail(
    form: { name: string; email: string; subject: string; message: string },
    ip?: string,
  ): Promise<void> {
    const to = this.config.get<string>('CONTACT_EMAIL', this.from);
    // Escapa TODOS os campos vindos do formulário — name/email/subject também,
    // não só a mensagem — para evitar injeção de HTML no e-mail do admin.
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const subject = `[Contato] ${esc(form.subject)}`;
    const html = `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
        <div style="background:#f5f5f5;padding:24px 32px;border-radius:12px 12px 0 0">
          <h1 style="margin:0;font-size:18px">Novo contato — Saldão da Reserva</h1>
        </div>
        <div style="padding:32px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 12px 12px">
          <p style="margin:0 0 8px"><strong>Nome:</strong> ${esc(form.name)}</p>
          <p style="margin:0 0 8px"><strong>E-mail:</strong> ${esc(form.email)}</p>
          <p style="margin:0 0 8px"><strong>Assunto:</strong> ${esc(form.subject)}</p>
          ${ip ? `<p style="margin:0 0 16px;font-size:12px;color:#999">IP: ${esc(ip)}</p>` : ''}
          <hr style="border:none;border-top:1px solid #e5e5e5;margin:16px 0">
          <p style="white-space:pre-wrap;margin:0">${esc(form.message)}</p>
        </div>
      </div>
    `;
    await this.send({ to, subject, html });
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private async send(opts: { to: string; subject: string; html: string }): Promise<void> {
    if (this.resend) {
      try {
        await this.resend.emails.send({
          from: `Saldão da Reserva <${this.from}>`,
          to: opts.to,
          subject: opts.subject,
          html: opts.html,
        });
      } catch (err) {
        this.logger.error(`Resend error to ${opts.to}: ${(err as Error).message}`);
      }
      return;
    }

    if (this.smtp) {
      try {
        await this.smtp.sendMail({
          from: `"Saldão da Reserva" <${this.from}>`,
          to: opts.to,
          subject: opts.subject,
          html: opts.html,
        });
      } catch (err) {
        this.logger.error(`SMTP error to ${opts.to}: ${(err as Error).message}`);
      }
      return;
    }

    this.logger.log(`[DEV — sem provedor] Email to ${opts.to} | ${opts.subject}`);
  }
}
