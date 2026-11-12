// Validates every research file in data/positions/ and confirms each quote really
// appears in its source. Runs on every pull request.
//
//   npm run check:research                 # fetch sources and verify every quote
//   npm run check:research -- --offline    # format checks only
//   npm run check:research -- a.json b.json   # format checks for all, quotes for these files
//   npm run check:research -- --base <ref> a.json   # only quotes that are new or changed since <ref>
//
// Some sites show GitHub's servers a different page than a browser gets, so pull
// requests only fetch the quotes they add or change; the nightly run checks everything.

import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fetchSource, quoteIsInSource, type Source } from '../lib/ai/research';
import { POSITIONS_DIR, PositionsFileSchema } from '../lib/ballot/positions';

const args = process.argv.slice(2);
const offline = args.includes('--offline');
const baseAt = args.indexOf('--base');
const base = baseAt >= 0 ? args[baseAt + 1] : undefined;
if (baseAt >= 0 && !base) throw new Error('--base needs a git ref');
const only = new Set(args.filter((a, i) => !a.startsWith('--') && (baseAt < 0 || i !== baseAt + 1)).map((a) => path.basename(a)));

const stanceKey = (name: string, issue: string, s: { quote: string; sourceUrl: string }) => JSON.stringify([name, issue, s.quote, s.sourceUrl]);

/** Quotes already in the file at `base`; unchanged ones were checked when they were added. */
function unchangedSince(ref: string, file: string): Set<string> {
  let text: string;
  try {
    text = execFileSync('git', ['show', `${ref}:data/positions/${file}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return new Set(); // new file
  }
  const old = JSON.parse(text) as { choices?: { name: string; stances?: Record<string, { quote: string; sourceUrl: string } | undefined> }[] };
  return new Set((old.choices ?? []).flatMap((c) => Object.entries(c.stances ?? {}).flatMap(([id, s]) => s ? [stanceKey(c.name, id, s)] : [])));
}

async function main() {
  const files = (await readdir(POSITIONS_DIR)).filter((f) => f.endsWith('.json')).sort();
  const sources = new Map<string, Source | Error>();
  let errors = 0;
  let warnings = 0;
  let quotes = 0;
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
    const known = base ? unchangedSince(base, f) : new Set<string>();
    for (const ch of file.choices) {
      for (const [id, s] of Object.entries(ch.stances)) {
        if (!s || known.has(stanceKey(ch.name, id, s))) continue;
        quotes++;
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
  console.log(`\nChecked ${files.length} files and ${quotes} quotes: ${errors} errors, ${warnings} warnings.`);
  process.exit(errors ? 1 : 0);
}

main();
