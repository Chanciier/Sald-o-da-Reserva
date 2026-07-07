import { BadRequestException } from '@nestjs/common';
import {
  brazilDateKey,
  brazilHour,
  endOfBrazilDay,
  parseReportRange,
  startOfBrazilDay,
  startOfBrazilMonth,
} from './report-range';

describe('report range in Brazil', () => {
  it('starts and ends a selected day at midnight in Sao Paulo', () => {
    const range = parseReportRange('2026-07-02', '2026-07-02');
    expect(range.start.toISOString()).toBe('2026-07-02T03:00:00.000Z');
    expect(range.endExclusive.toISOString()).toBe('2026-07-03T03:00:00.000Z');
    expect(range.days).toBe(1);
  });

  it('groups UTC timestamps using the Brazilian calendar day and hour', () => {
    expect(brazilDateKey(new Date('2026-07-03T02:59:59.000Z'))).toBe('2026-07-02');
    expect(brazilHour(new Date('2026-07-03T02:59:59.000Z'))).toBe(23);
    expect(brazilDateKey(new Date('2026-07-03T03:00:00.000Z'))).toBe('2026-07-03');
  });

  it('rejects invalid and excessive ranges at the API boundary', () => {
    expect(() => parseReportRange('02/07/2026', '2026-07-02')).toThrow(BadRequestException);
    expect(() => parseReportRange('2025-01-01', '2026-07-02')).toThrow(BadRequestException);
  });

  it('keeps "today"/"this month" anchored to Sao Paulo, not the server clock', () => {
    // 2026-07-07 23:30 in Sao Paulo, already 2026-07-08 in UTC.
    const lateNight = new Date('2026-07-08T02:30:00.000Z');
    expect(startOfBrazilDay(lateNight).toISOString()).toBe('2026-07-07T03:00:00.000Z');
    expect(endOfBrazilDay(lateNight).toISOString()).toBe('2026-07-08T03:00:00.000Z');
    expect(startOfBrazilMonth(lateNight).toISOString()).toBe('2026-07-01T03:00:00.000Z');

    // 2026-07-31 23:00 in Sao Paulo is already 2026-08-01 in UTC — the month
    // must not roll over to August until it actually is August in Brazil.
    const monthEdge = new Date('2026-08-01T02:00:00.000Z');
    expect(startOfBrazilMonth(monthEdge).toISOString()).toBe('2026-07-01T03:00:00.000Z');
  });
});
