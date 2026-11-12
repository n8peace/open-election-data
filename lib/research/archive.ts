const DEFAULT_ARCHIVE_TIMESTAMP = '20261103';

export interface CdxCapture {
  timestamp: string;
  originalUrl: string;
}

/** Converts a stance verification date to the compact timestamp Wayback expects. */
export function checkedAtTimestamp(checkedAt?: string): string {
  if (/^\d{8}$/.test(checkedAt ?? '')) return checkedAt!;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(checkedAt ?? '');
  return match ? `${match[1]}${match[2]}${match[3]}` : DEFAULT_ARCHIVE_TIMESTAMP;
}

export function archiveUrl(timestamp: string, originalUrl: string): string {
  return `https://web.archive.org/web/${timestamp}/${originalUrl}`;
}

/** Reads the header-based JSON returned by CDX and returns valid captures newest first. */
export function capturesFromCdx(rows: unknown): CdxCapture[] {
  if (!Array.isArray(rows) || !Array.isArray(rows[0])) return [];
  const header = rows[0];
  const timestampIndex = header.indexOf('timestamp');
  const originalIndex = header.indexOf('original');
  const statusIndex = header.indexOf('statuscode');
  if (timestampIndex < 0 || originalIndex < 0) return [];

  const captures: CdxCapture[] = [];
  const seen = new Set<string>();
  for (const value of rows.slice(1)) {
    if (!Array.isArray(value)) continue;
    const timestamp = value[timestampIndex];
    const originalUrl = value[originalIndex];
    if (typeof timestamp !== 'string' || !/^\d{8,14}$/.test(timestamp)) continue;
    if (typeof originalUrl !== 'string' || !/^https?:\/\//.test(originalUrl)) continue;
    if (statusIndex >= 0 && String(value[statusIndex]) !== '200') continue;
    const key = `${timestamp}\n${originalUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);
    captures.push({ timestamp, originalUrl });
  }
  return captures.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}
