// Rechecks a claim a voter reported. Runs from GitHub Actions when an issue is
// labeled "claim-report" (see .github/workflows/recheck.yml), or by hand:
//
//   npm run recheck -- 123          # GitHub issue number
//
// Reads the structured block the report form wrote, runs fresh independent agents
// on just that claim (3, escalating to 10 on disagreement), and updates the
// research file if the result changed; the workflow publishes it.
// The voter's free-text words are never given to the agents; only their link.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { contestKey, nameKey, POSITIONS_DIR, PositionsFileSchema, type PositionsFileInput } from '../lib/ballot/positions';
import { ISSUE_IDS, issueById, NEITHER, type IssueId } from '../lib/issues';
import { researchWithConsensus } from '../lib/research/run';

interface ReportBlock { contestId: string; office: string; district?: string; candidate?: string; issue: string; sourceUrl?: string }

const REPO = process.env.GITHUB_REPOSITORY || 'n8peace/agent-swarm-election-data';

async function readIssue(n: number): Promise<ReportBlock> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/issues/${n}`, {
    headers: { accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) },
  });
  if (!res.ok) throw new Error(`Couldn't read issue #${n} (${res.status})`);
  const { body } = (await res.json()) as { body: string };
  const m = /```json plainballot-report\n([\s\S]*?)\n```/.exec(body ?? '');
  if (!m) throw new Error('No report block in this issue.');
  return JSON.parse(m[1]);
}

async function findFile(r: ReportBlock): Promise<string | null> {
  const files = (await readdir(POSITIONS_DIR)).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
  for (const f of files) {
    const d = JSON.parse(await readFile(path.join(POSITIONS_DIR, f), 'utf8'));
    const key = contestKey(d.office, d.district);
    if (key === r.contestId || key === contestKey(r.office, r.district)) return f;
  }
  return null;
}

async function main() {
  const n = Number(process.argv[2]);
  if (!n) throw new Error('Usage: npm run recheck -- <issue number>');
  const r = await readIssue(n);
  const summary: string[] = [];
  const done = async () => { await writeFile('recheck-summary.md', summary.join('\n') + '\n'); console.log(summary.join('\n')); };

  const file = await findFile(r);
  if (!file) { summary.push(`We don't have research for **${r.office}** yet, so there's nothing to recheck. It's now on the research list.`); return done(); }
  if (r.issue === 'roster' || r.issue === 'other' || !r.candidate) {
    summary.push(`This report needs a person to look at it (it's about ${r.issue === 'roster' ? 'who is on the ballot' : 'something other than one position'}).`);
    return done();
  }
  if (!(ISSUE_IDS as readonly string[]).includes(r.issue)) throw new Error(`Unknown issue "${r.issue}"`);

  const fullPath = path.join(POSITIONS_DIR, file);
  const raw = JSON.parse(await readFile(fullPath, 'utf8')) as PositionsFileInput;
  const choice = raw.choices.find((c) => nameKey(c.name) === nameKey(r.candidate!));
  if (!choice) { summary.push(`Couldn't find ${r.candidate} in ${file}. A person will take a look.`); return done(); }

  const id = r.issue as IssueId;
  const i = issueById[id];
  const before = choice.stances?.[id];
  const res = await researchWithConsensus({
    name: choice.name,
    office: [raw.office, raw.district].filter(Boolean).join(', '),
    issues: [id],
    seedUrls: r.sourceUrl ? [r.sourceUrl] : undefined,
  });
  const d = res.decisions[id];
  const describe = (s?: { toward: string; strength: string }) => (s ? `${s.strength} · ${s.toward}` : 'no sourced position');

  summary.push(`**Recheck of ${choice.name} on ${i.name}** (${res.runs} independent agents: ${res.models.join(', ')})`, '');
  summary.push(`- Before: ${describe(before)}`);
  if (!d) {
    summary.push('- After: the agents had no majority, so this position is now left blank rather than guessed.');
    if (choice.stances) delete choice.stances[id];
  } else if (!d.stance) {
    summary.push(`- After: no sourced position (${d.agreement} agree).`);
    if (choice.stances) delete choice.stances[id];
  } else {
    const s = d.stance;
    const next = { toward: s.pos === 0 ? NEITHER : s.pos < 0 ? i.l : i.r, strength: (Math.abs(s.pos) === 2 ? 'strong' : 'lean') as 'lean' | 'strong', text: s.text, quote: s.quote, sourceUrl: s.sourceUrl, agreement: d.agreement };
    summary.push(`- After: ${describe(next)} (${d.agreement} agree). Source: ${next.sourceUrl}`, `  > ${next.quote}`);
    choice.stances = { ...choice.stances, [id]: next };
  }
  const changed = JSON.stringify(before ?? null) !== JSON.stringify(choice.stances?.[id] ?? null);
  const sameSide = (before?.toward ?? 'none') === (choice.stances?.[id]?.toward ?? 'none') && (before?.strength ?? '') === (choice.stances?.[id]?.strength ?? '');
  if (!changed || sameSide) {
    summary.push('', 'The recheck agrees with what we had, so nothing changes. If you still think it’s wrong, reply with a link that shows it.');
    return done();
  }
  PositionsFileSchema.parse(raw); // never write an invalid file
  raw.checkedAt = new Date().toISOString().slice(0, 10);
  await writeFile(fullPath, JSON.stringify(raw, null, 2) + '\n');
  summary.push('', 'The recheck changed this position.');
  await done();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
