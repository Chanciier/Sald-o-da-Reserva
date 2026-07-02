import { BadRequestException } from '@nestjs/common';

export const REPORT_TIME_ZONE = 'America/Sao_Paulo';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parts(date: Date, timeZone = REPORT_TIME_ZONE) {
  const values = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(values.map(({ type, value }) => [type, value]));
}

export function brazilDateKey(date: Date): string {
  const p = parts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

export function brazilHour(date: Date): number {
  return Number(parts(date).hour);
}

function localMidnightToUtc(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const target = Date.UTC(year, month - 1, day);
  let guess = target;
  for (let i = 0; i < 2; i += 1) {
    const p = parts(new Date(guess));
    const represented = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day));
    guess += target - represented;
    const hour = Number(p.hour);
    const minute = Number(p.minute);
    guess -= hour * 60 * 60 * 1000 + minute * 60 * 1000;
  }
  return new Date(guess);
}

function addUtcDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function parseReportRange(from?: string, to?: string) {
  const today = brazilDateKey(new Date());
  const defaultFrom = `${today.slice(0, 8)}01`;
  const startKey = from ?? defaultFrom;
  const endKey = to ?? today;

  if (!DATE_RE.test(startKey) || !DATE_RE.test(endKey)) {
    throw new BadRequestException('Datas devem usar o formato AAAA-MM-DD.');
  }
  const start = localMidnightToUtc(startKey);
  const endExclusive = localMidnightToUtc(addUtcDays(endKey, 1));
  const days = Math.round((Date.parse(endKey) - Date.parse(startKey)) / 86_400_000) + 1;
  if (!Number.isFinite(days) || days < 1 || days > 366) {
    throw new BadRequestException('Selecione um período entre 1 e 366 dias.');
  }

  const previousEndExclusive = start;
  const previousStart = new Date(start.getTime() - days * 86_400_000);
  return {
    start,
    endExclusive,
    previousStart,
    previousEndExclusive,
    from: startKey,
    to: endKey,
    days,
  };
}
