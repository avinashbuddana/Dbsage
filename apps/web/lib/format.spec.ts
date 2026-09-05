import { describe, expect, it } from 'vitest';

import { formatBytes, formatDuration, formatRowCount } from './format';

describe('formatBytes', () => {
  it('renders zero and small byte counts without decimals', () => {
    expect(formatBytes('0')).toBe('0 B');
    expect(formatBytes(500)).toBe('500 B');
  });

  it('renders kilobyte, megabyte, and gigabyte magnitudes with one decimal', () => {
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(1_500_000)).toBe('1.4 MB');
    expect(formatBytes('1073741824')).toBe('1.0 GB');
  });
});

describe('formatRowCount', () => {
  it('adds thousands separators', () => {
    expect(formatRowCount('2431994')).toBe('2,431,994');
  });

  it('falls back to the raw string for a non-numeric value', () => {
    expect(formatRowCount('not-a-number')).toBe('not-a-number');
  });
});

describe('formatDuration', () => {
  it('formats a sub-minute duration in seconds', () => {
    expect(formatDuration('2026-09-05T09:45:00.000Z', '2026-09-05T09:45:45.000Z')).toBe('45s');
  });

  it('formats a multi-minute duration in minutes and seconds', () => {
    expect(formatDuration('2026-09-05T09:45:00.000Z', '2026-09-05T09:48:42.000Z')).toBe('3m 42s');
  });

  it('formats an hour-plus duration in hours and minutes', () => {
    expect(formatDuration('2026-09-05T09:00:00.000Z', '2026-09-05T10:12:00.000Z')).toBe('1h 12m');
  });

  it('returns a placeholder when either timestamp is missing', () => {
    expect(formatDuration(null, '2026-09-05T09:45:45.000Z')).toBe('—');
    expect(formatDuration('2026-09-05T09:45:00.000Z', null)).toBe('—');
  });
});
