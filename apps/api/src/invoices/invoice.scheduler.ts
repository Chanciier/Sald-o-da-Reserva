import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InvoiceRepository } from './invoice.repository';
import { InvoiceService } from './invoice.service';

@Injectable()
export class InvoiceScheduler {
  private readonly logger = new Logger(InvoiceScheduler.name);

  constructor(
    private readonly repo: InvoiceRepository,
    private readonly service: InvoiceService,
  ) {}

  // Every 10 minutes: sync PENDING/PROCESSING invoices with Focus NFe
  @Cron(CronExpression.EVERY_10_MINUTES)
  async syncPending() {
    const pending = await this.repo.findPending();
    if (!pending.length) return;

    this.logger.log(`Scheduler: syncing ${pending.length} pending invoice(s)`);
    for (const invoice of pending) {
      try {
        await this.service.syncStatus(invoice.id);
      } catch (err) {
        this.logger.warn(`Scheduler: failed to sync invoice ${invoice.id}`, err);
      }
    }
  }
}
