import { describe, expect, it } from 'vitest';
import { archiveUrl, capturesFromCdx, checkedAtTimestamp } from '../lib/research/archive';

describe('archive helpers', () => {
  it('converts a checkedAt date to the Wayback timestamp format', () => {
    expect(checkedAtTimestamp('2026-09-25')).toBe('20260925');
    expect(checkedAtTimestamp('20260925')).toBe('20260925');
    expect(checkedAtTimestamp()).toBe('20261103');
    expect(checkedAtTimestamp('not a date')).toBe('20261103');
  });

  it('builds a Wayback snapshot URL from a timestamp and original URL', () => {
    expect(archiveUrl('20260925123456', 'https://example.com/issues?q=housing')).toBe(
      'https://web.archive.org/web/20260925123456/https://example.com/issues?q=housing',
    );
  });

  it('picks valid CDX captures newest first using the response header', () => {
    const rows = [
      ['urlkey', 'timestamp', 'original', 'mimetype', 'statuscode', 'digest', 'length'],
      ['com,example)/', '20260901000000', 'http://example.com/', 'text/html', '200', 'A', '100'],
      ['com,example)/', '20261001000000', 'https://example.com/', 'text/html', '200', 'B', '100'],
      ['com,example)/', 'bad', 'https://example.com/', 'text/html', '200', 'C', '100'],
    ];

    expect(capturesFromCdx(rows)).toEqual([
      { timestamp: '20261001000000', originalUrl: 'https://example.com/' },
      { timestamp: '20260901000000', originalUrl: 'http://example.com/' },
    ]);
  });
});
