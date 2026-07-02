import { BadRequestException } from '@nestjs/common';
import { brazilDateKey, brazilHour, parseReportRange } from './report-range';

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
});
