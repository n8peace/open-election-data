// Compares candidate research models against research a person already approved.
//   npm run compare-models -- gateway:openai/gpt-5.6-luna gateway:deepseek/deepseek-v4.1-flash
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { gateway } from 'ai';
import { POSITIONS_DIR, PositionsFileSchema } from '../lib/ballot/positions';
import type { IssueId } from '../lib/issues';
import { runAgent } from '../lib/research/agent';

const FILES = ['u-s-house-california-district-10.json', 'governor-california.json'];

async function main() {
  const models = process.argv.slice(2);
  const cases = [];
  for (const f of FILES) {
    const d = PositionsFileSchema.parse(JSON.parse(await readFile(path.join(POSITIONS_DIR, f), 'utf8')));
    for (const c of d.choices) cases.push({ office: [d.office, d.district].filter(Boolean).join(', '), issues: d.issues as IssueId[], name: c.name, approved: c.stances });
  }
  for (const m of models) {
    process.env.RESEARCH_MODELS = m;
    const before = Number((await gateway.getCredits()).totalUsed);
    let agree = 0, conflict = 0, missed = 0, extra = 0, failed = 0;
    for (const c of cases) {
      try {
        const r = await runAgent({ name: c.name, office: c.office, issues: c.issues, run: 0 });
        for (const id of c.issues) {
          const a = c.approved[id], g = r[id];
          if (a && g) { if (Math.sign(a.pos) === Math.sign(g.pos)) agree++; else conflict++; }
          else if (a && !g) missed++;
          else if (!a && g) extra++;
        }
      } catch { failed++; }
    }
    const cost = Number((await gateway.getCredits()).totalUsed) - before;
    console.log(`${m}: agree ${agree}, CONFLICT ${conflict}, missed ${missed}, extra ${extra}, failed ${failed}/${cases.length}, cost $${cost.toFixed(2)} for ${cases.length} candidates`);
  }
}
main();
