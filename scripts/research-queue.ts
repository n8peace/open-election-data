// Research a folder of prepared contest inputs (e.g. from `npm run ca:list`), a few at a
// time, skipping contests already researched. Stops cleanly when AI credit runs low.
//
//   npm run research:queue -- data/research/ca state-senate state-assembly

import { execFile } from 'node:child_process';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { gateway } from 'ai';
import { POSITIONS_DIR } from '../lib/ballot/positions';
import { canonicalOffice } from '../lib/research/divisions';

const run = promisify(execFile);

async function main() {
  const [dir, ...prefixes] = process.argv.slice(2);
  const covered = new Set<string>();
  for (const f of (await readdir(POSITIONS_DIR)).filter((f) => f.endsWith('.json') && !f.startsWith('_'))) {
    const d = JSON.parse(await readFile(path.join(POSITIONS_DIR, f), 'utf8'));
    if (d.division) covered.add(`${d.division}|${canonicalOffice(d.office)}`);
  }
  // Races a contributor has claimed on GitHub are left for them (data/research/claimed.json).
  for (const c of JSON.parse(await readFile(path.join('data', 'research', 'claimed.json'), 'utf8').catch(() => '[]')) as { division: string; office: string }[]) {
    covered.add(`${c.division}|${canonicalOffice(c.office)}`);
  }
  const queue: string[] = [];
  for (const f of (await readdir(dir)).filter((f) => f.endsWith('.json') && prefixes.some((p) => f.startsWith(p))).sort()) {
    const d = JSON.parse(await readFile(path.join(dir, f), 'utf8'));
    if (!covered.has(`${d.division}|${canonicalOffice(d.office)}`)) queue.push(path.join(dir, f));
  }
  console.log(`${queue.length} contests to research.`);
  const minBalance = Number(process.env.RESEARCH_MIN_BALANCE || 5);
  let done = 0;
  const worker = async () => {
    while (queue.length) {
      const balance = Number((await gateway.getCredits().catch(() => ({ balance: '999' }))).balance);
      if (balance < minBalance) { console.log(`  ■ stopping: AI credit is $${balance.toFixed(2)}. Add credit and rerun to continue.`); return; }
      const file = queue.shift()!;
      const name = path.basename(file, '.json');
      try {
        const { stdout, stderr } = await run('node', ['--env-file-if-exists=.env.local', '--import', 'tsx', 'scripts/research.ts', file], { maxBuffer: 50 * 1024 * 1024, timeout: 60 * 60 * 1000 });
        await writeFile(file.replace(/\.json$/, '.log'), stdout + stderr);
        console.log(`  ✓ ${name} (${++done} done, ${queue.length} left)`);
      } catch (e) {
        console.log(`  ✗ ${name}: ${(e as Error).message.split('\n').slice(-2).join(' ')}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Number(process.env.RESEARCH_PARALLEL || 2) }, worker));
  console.log('Done.');
}

main();
