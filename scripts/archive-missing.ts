// Replace stale source URLs with Internet Archive snapshots that contain the exact quote.
// npm run archive:missing -- data/positions/example.json --dry-run
import { readdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fetchSource, quoteIsInSource, type Source } from '../lib/ai/research';
import { POSITIONS_DIR, PositionsFileSchema, type PositionsFileInput } from '../lib/ballot/positions';
import { archiveUrl, capturesFromCdx, checkedAtTimestamp } from '../lib/research/archive';

const ARCHIVE_PREFIX = 'https://web.archive.org/';
const REQUEST_INTERVAL_MS = 1_000;

function options(args: string[]) {
  const out: { files: string[]; dryRun: boolean } = { files: [], dryRun: false };
  for (const arg of args) {
    if (arg === '--dry-run') out.dryRun = true;
    else if (arg.startsWith('-')) throw new Error(`Unknown argument: ${arg}`);
    else out.files.push(arg);
  }
  return out;
}

function sourceCache() {
  const cache = new Map<string, Promise<Source | null>>();
  return (url: string, beforeFetch?: () => Promise<void>): Promise<Source | null> => {
    let pending = cache.get(url);
    if (!pending) {
      pending = (async () => {
        await beforeFetch?.();
        return fetchSource(url).catch(() => null);
      })();
      cache.set(url, pending);
    }
    return pending;
  };
}

function archiveThrottle() {
  let lastRequest = 0;
  return async () => {
    const wait = REQUEST_INTERVAL_MS - (Date.now() - lastRequest);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequest = Date.now();
  };
}

async function archiveJson(url: string, throttle: () => Promise<void>): Promise<unknown> {
  await throttle();
  const response = await fetch(url, {
    headers: { 'user-agent': 'PlainBallotResearch/0.1 (+https://plainballot.com/methodology)' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

async function findArchivedQuote(
  sourceUrl: string,
  quote: string,
  checkedAt: string | undefined,
  loadSource: ReturnType<typeof sourceCache>,
  throttle: () => Promise<void>,
): Promise<string | null> {
  const timestamp = checkedAtTimestamp(checkedAt);
  const availableUrl = `https://archive.org/wayback/available?url=${encodeURIComponent(sourceUrl)}&timestamp=${timestamp}`;
  try {
    const result = await archiveJson(availableUrl, throttle) as {
      archived_snapshots?: { closest?: { available?: boolean; timestamp?: string } };
    };
    const closest = result.archived_snapshots?.closest;
    if (closest?.available && typeof closest.timestamp === 'string') {
      const candidate = archiveUrl(closest.timestamp, sourceUrl);
      const page = await loadSource(candidate, throttle);
      if (page && quoteIsInSource(quote, candidate, [page])) return candidate;
    }
  } catch {
    // A failed availability lookup should not prevent the CDX fallback.
  }

  const cdxUrl = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(sourceUrl)}&output=json&filter=statuscode:200&collapse=digest&limit=-5`;
  let rows: unknown;
  try {
    rows = await archiveJson(cdxUrl, throttle);
  } catch {
    return null;
  }
  for (const capture of capturesFromCdx(rows)) {
    const candidate = archiveUrl(capture.timestamp, capture.originalUrl);
    const page = await loadSource(candidate, throttle);
    if (page && quoteIsInSource(quote, candidate, [page])) return candidate;
  }
  return null;
}

function resolveFile(arg: string): string {
  return path.isAbsolute(arg)
    ? arg
    : path.dirname(arg) === '.' ? path.join(POSITIONS_DIR, arg) : path.resolve(arg);
}

async function main() {
  const opts = options(process.argv.slice(2));
  const files = opts.files.length > 0
    ? opts.files.map(resolveFile)
    : (await readdir(POSITIONS_DIR))
        .filter((file) => file.endsWith('.json') && !file.startsWith('_'))
        .sort()
        .map((file) => path.join(POSITIONS_DIR, file));
  const loadSource = sourceCache();
  const throttle = archiveThrottle();
  const counts = { stances: 0, alreadyArchived: 0, present: 0, unreachable: 0, missing: 0, archived: 0, noCopy: 0, filesChanged: 0 };

  for (const dest of files) {
    const file = path.basename(dest);
    const raw = JSON.parse(await readFile(dest, 'utf8')) as PositionsFileInput;
    let changed = false;
    for (const choice of raw.choices) {
      for (const [issue, stance] of Object.entries(choice.stances)) {
        if (!stance) continue;
        counts.stances++;
        if (stance.sourceUrl.startsWith(ARCHIVE_PREFIX)) {
          counts.alreadyArchived++;
          continue;
        }
        const page = await loadSource(stance.sourceUrl);
        if (!page) {
          counts.unreachable++;
          console.log(`${file} | ${choice.name} | ${issue}: unreachable`);
          continue;
        }
        if (quoteIsInSource(stance.quote, stance.sourceUrl, [page])) {
          counts.present++;
          continue;
        }

        counts.missing++;
        const found = await findArchivedQuote(stance.sourceUrl, stance.quote, raw.checkedAt, loadSource, throttle);
        if (!found) {
          counts.noCopy++;
          console.log(`${file} | ${choice.name} | ${issue}: no archived copy has the quote`);
          continue;
        }
        counts.archived++;
        console.log(`${file} | ${choice.name} | ${issue}: archived ${found}`);
        if (!opts.dryRun) {
          stance.sourceUrl = found;
          changed = true;
        }
      }
    }
    if (changed) {
      PositionsFileSchema.parse(raw);
      const temp = `${dest}.archive.tmp`;
      await writeFile(temp, JSON.stringify(raw, null, 2) + '\n');
      await rename(temp, dest);
      counts.filesChanged++;
    }
  }

  console.log(`${opts.dryRun ? 'Dry run: ' : ''}${counts.stances} stances checked; ${counts.present} current; ${counts.alreadyArchived} already archived; ${counts.unreachable} unreachable; ${counts.missing} missing; ${counts.archived} archived; ${counts.noCopy} without a matching archive; ${counts.filesChanged} files changed.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
