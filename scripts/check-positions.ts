// Validates every research file in data/positions/ and confirms each quote really
// appears in its source. Runs on every pull request.
//
//   npm run check:research                 # fetch sources and verify every quote
//   npm run check:research -- --offline    # format checks only
//   npm run check:research -- a.json b.json   # format checks for all, quotes for these files
//
// Some sites show GitHub's servers a different page than a browser gets, so pull
// requests only fetch the files they change; the nightly run checks everything.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fetchSource, quoteIsInSource, type Source } from '../lib/ai/research';
import { POSITIONS_DIR, PositionsFileSchema } from '../lib/ballot/positions';

const offline = process.argv.includes('--offline');
const only = new Set(process.argv.slice(2).filter((a) => !a.startsWith('--')).map((a) => path.basename(a)));

async function main() {
  const files = (await readdir(POSITIONS_DIR)).filter((f) => f.endsWith('.json')).sort();
  const sources = new Map<string, Source | Error>();
  let errors = 0;
  let warnings = 0;
  const fail = (f: string, msg: string) => { errors++; console.log(`  ✗ ${f}: ${msg}`); };
  const warn = (f: string, msg: string) => { warnings++; console.log(`  ! ${f}: ${msg}`); };

  for (const f of files) {
    const raw = JSON.parse(await readFile(path.join(POSITIONS_DIR, f), 'utf8'));
    const parsed = PositionsFileSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) fail(f, `${issue.path.join('.')}: ${issue.message}`);
      continue;
    }
    const file = parsed.data;
    for (const ch of file.choices) {
      const ids = Object.keys(ch.stances);
      if (!ids.length) warn(f, `${ch.name} has no researched positions yet`);
      for (const id of ids) {
        if (!file.issues.includes(id as never)) fail(f, `${ch.name}: "${id}" isn't listed in this contest's issues`);
      }
    }
    // Template files show the format; their example URLs aren't real.
    if (offline || f.startsWith('_') || (only.size && !only.has(f))) continue;
    for (const ch of file.choices) {
      for (const [id, s] of Object.entries(ch.stances)) {
        if (!s) continue;
        if (!sources.has(s.sourceUrl)) {
          sources.set(s.sourceUrl, await fetchSource(s.sourceUrl).catch((e: Error) => e));
        }
        const src = sources.get(s.sourceUrl)!;
        if (src instanceof Error) {
          warn(f, `${ch.name} / ${id}: couldn't fetch ${s.sourceUrl} (${src.message}). A reviewer must check this quote by hand.`);
        } else if (!quoteIsInSource(s.quote, s.sourceUrl, [src])) {
          fail(f, `${ch.name} / ${id}: quote not found in ${s.sourceUrl}`);
        }
      }
    }
  }
  console.log(`\nChecked ${files.length} files: ${errors} errors, ${warnings} warnings.`);
  process.exit(errors ? 1 : 0);
}

main();
