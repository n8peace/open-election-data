// Add agreed quote-voice labels to existing positions without changing claims.
// npm run backfill:voice -- --state CA --limit 5 --dry-run
import { readdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { quoteIsInSource } from '../lib/ai/research';
import { POSITIONS_DIR, PositionsFileSchema, type PositionsFileInput } from '../lib/ballot/positions';
import { classifyVoice, pendingStances, sourceCache } from '../lib/research/voice';
import { isBallotQuestion } from '../lib/research/measure';

function options(args: string[]) {
  const out: { limit?: number; state?: string; dryRun: boolean; backend: string } = { dryRun: false, backend: 'codex' };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--limit') out.limit = Number(args[++i]);
    else if (arg === '--state') out.state = args[++i]?.toLowerCase();
    else if (arg === '--backend') out.backend = args[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (out.limit !== undefined && (!Number.isSafeInteger(out.limit) || out.limit < 1)) throw new Error('--limit needs a positive integer');
  if (out.state && !/^[a-z]{2}$/.test(out.state)) throw new Error('--state needs a two-letter code');
  if (!out.backend || !/^(codex(?::[\w.-]+)?|claude-code|gateway:[\w./-]+|ollama:[\w.:-]+)$/.test(out.backend)) throw new Error('Unknown backend');
  return out;
}

async function main() {
  const opts = options(process.argv.slice(2));
  const loadSource = sourceCache();
  const files = (await readdir(POSITIONS_DIR)).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort();
  let examined = 0;
  let labeled = 0;
  for (const file of files) {
    if (opts.limit !== undefined && examined >= opts.limit) break;
    const dest = path.join(POSITIONS_DIR, file);
    const raw = JSON.parse(await readFile(dest, 'utf8')) as PositionsFileInput;
    if (opts.state && !raw.division?.startsWith(`${opts.state}/`)) continue;
    const pending = pendingStances(raw);
    let changed = false;
    for (const { choice, issue, stance } of pending) {
      if (opts.limit !== undefined && examined >= opts.limit) break;
      examined++;
      const page = await loadSource(stance.sourceUrl);
      if (!page) { console.log(`${file} | ${choice.name} | ${issue}: source unavailable`); continue; }
      if (!quoteIsInSource(stance.quote, stance.sourceUrl, [page])) { console.log(`${file} | ${choice.name} | ${issue}: quote not in source`); continue; }
      const voice = raw.kind === 'measure' && isBallotQuestion(stance.quote)
        ? 'record'
        : await classifyVoice(stance.quote, stance.sourceUrl, { backend: opts.backend, loadSource });
      console.log(`${file} | ${choice.name} | ${issue}: ${voice ?? 'unresolved'}`);
      if (!voice) continue;
      labeled++;
      if (!opts.dryRun) { stance.voice = voice; changed = true; }
    }
    if (changed) {
      PositionsFileSchema.parse(raw);
      const temp = `${dest}.voice.tmp`;
      await writeFile(temp, JSON.stringify(raw, null, 2) + '\n');
      await rename(temp, dest);
    }
  }
  console.log(`${opts.dryRun ? 'Dry run: ' : ''}${examined} unlabeled stances checked; ${labeled} agreed labels${opts.dryRun ? '; 0 files changed' : ''}.`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
