import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrintJob, PrintJobStatus, PrintJobType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QueryPrintJobsDto } from './dto/query-print-jobs.dto';

/** Transições que o Print Agent (device) tem permissão de reportar. */
const DEVICE_ALLOWED_TRANSITIONS: Partial<Record<PrintJobStatus, PrintJobStatus[]>> = {
  [PrintJobStatus.SENT]: [PrintJobStatus.PRINTING, PrintJobStatus.FAILED],
  [PrintJobStatus.PRINTING]: [PrintJobStatus.PRINTED, PrintJobStatus.FAILED],
};

const JOB_INCLUDE = {
  order: { select: { id: true, buyerName: true, deliveryMethod: true } },
  device: { select: { id: true, name: true } },
} as const;

@Injectable()
export class PrintJobsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Admin ───────────────────────────────────────────────────────────────

  list(query: QueryPrintJobsDto) {
    return this.prisma.printJob.findMany({
      where: { status: query.status, type: query.type, orderId: query.orderId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: JOB_INCLUDE,
    });
  }

  async findOne(id: string) {
    const job = await this.prisma.printJob.findUnique({ where: { id }, include: JOB_INCLUDE });
    if (!job) throw new NotFoundException('Job de impressão não encontrado.');
    return job;
  }

  /** Reimprime: volta o job para a fila (mantendo o documento já gerado) e audita. */
  async reprint(id: string, actor: string): Promise<PrintJob> {
    const job = await this.findOne(id);
    const status = job.documentUrl ? PrintJobStatus.READY : PrintJobStatus.PENDING;

    const updated = await this.prisma.printJob.update({
      where: { id },
      data: {
        status,
        attempts: 0,
        lastError: null,
        deviceId: null,
        sentAt: null,
        printedAt: null,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'print.reprint',
        metadata: { printJobId: id, orderId: job.orderId, type: job.type, actor },
      },
    });

    return updated;
  }

  // ── Print Agent (device) ───────────────────────────────────────────────

  listClaimable(type?: PrintJobType) {
    return this.prisma.printJob.findMany({
      where: { status: PrintJobStatus.READY, type },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
  }

  async claim(id: string, deviceId: string): Promise<PrintJob> {
    const job = await this.findOne(id);
    if (job.status !== PrintJobStatus.READY) {
      throw new BadRequestException(
        `Job não está pronto para ser enviado (status atual: ${job.status}).`,
      );
    }
    return this.prisma.printJob.update({
      where: { id },
      data: { status: PrintJobStatus.SENT, deviceId, sentAt: new Date() },
    });
  }

  async updateStatus(
    id: string,
    deviceId: string,
    status: PrintJobStatus,
    error?: string,
  ): Promise<PrintJob> {
    const job = await this.findOne(id);
    if (job.deviceId !== deviceId) {
      throw new BadRequestException('Este job não pertence a este dispositivo.');
    }

    const allowed = DEVICE_ALLOWED_TRANSITIONS[job.status] ?? [];
    if (!allowed.includes(status)) {
      throw new BadRequestException(`Transição inválida: ${job.status} → ${status}.`);
    }

    return this.prisma.printJob.update({
      where: { id },
      data: {
        status,
        lastError:
          status === PrintJobStatus.FAILED ? (error ?? 'Falha reportada pelo dispositivo.') : null,
        attempts: status === PrintJobStatus.FAILED ? { increment: 1 } : undefined,
        printedAt: status === PrintJobStatus.PRINTED ? new Date() : undefined,
      },
    });
  }
}
