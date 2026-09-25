// Research by agents started from a Claude Code session (on the Claude plan) plus a
// cheap API agent for a second model family. Agents write their findings to
//   data/research/runs/<contest>/<candidate>/<agent>.json
// and this script verifies every quote and applies the agreement rules.
//
//   npm run -s consensus -- brief <input.json> "<candidate>"   # print the research brief for an agent
//   npm run -s consensus -- api   <input.json> "<candidate>"   # run one API agent (GPT-5.6 Luna)
//   npm run -s consensus -- decide <input.json>                # verify, decide, write positions or say what's missing

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fetchSource, quoteIsInSource, type ResearchedStance, type Source } from '../lib/ai/research';
import { issuesForOffice } from '../lib/ballot/offices';
import { contestKey, POSITIONS_DIR, slug, type PositionsFileInput } from '../lib/ballot/positions';
import { issueById, NEITHER, toPosition, type IssueId } from '../lib/issues';
import { cliPrompt } from '../lib/research/backends';
import { decide, FIRST_ROUND, type AgentResult } from '../lib/research/consensus';
import { runAgent } from '../lib/research/agent';

interface Input { office: string; district?: string; division?: string; kind?: string; choices: { name: string; party?: string; incumbent?: boolean }[] }
interface RawStance { issue: string; toward: string; strength: 'lean' | 'strong'; summary: string; quote: string; sourceUrl: string }

const RUNS = path.join('data', 'research', 'runs');
const load = async (f: string) => JSON.parse(await readFile(f, 'utf8')) as Input;
const officeLine = (i: Input) => [i.office, i.district].filter(Boolean).join(', ');
const runDir = (i: Input, name: string) => path.join(RUNS, contestKey(i.office, i.district), slug(name));

async function readRuns(dir: string): Promise<RawStance[][]> {
  const files = await readdir(dir).catch(() => [] as string[]);
  const out: RawStance[][] = [];
  for (const f of files.filter((f) => f.endsWith('.json')).sort()) {
    try {
      const d = JSON.parse(await readFile(path.join(dir, f), 'utf8'));
      out.push(Array.isArray(d.stances) ? d.stances : []);
    } catch { /* unreadable run: skip */ }
  }
  return out;
}

const pages = new Map<string, Source | null>();
async function verify(raw: RawStance[], issues: IssueId[]): Promise<AgentResult> {
  const out: AgentResult = {};
  for (const s of raw) {
    const id = s.issue as IssueId;
    if (!issues.includes(id) || out[id]) continue;
    const pos = toPosition(id, s.toward, s.strength);
    if (pos === null) continue;
    if (!pages.has(s.sourceUrl)) pages.set(s.sourceUrl, await fetchSource(s.sourceUrl).catch(() => null));
    const page = pages.get(s.sourceUrl);
    if (!page || !quoteIsInSource(s.quote, s.sourceUrl, [page])) continue; // unverifiable: drop
    out[id] = { pos, text: s.summary, quote: s.quote, sourceUrl: s.sourceUrl } satisfies ResearchedStance;
  }
  return out;
}

async function main() {
  const [cmd, file, name] = process.argv.slice(2);
  const input = await load(file);
  const issues = issuesForOffice(input.office);

  if (cmd === 'brief') {
    console.log(cliPrompt({ name, office: officeLine(input), issues }));
    console.log(`\nWrite that JSON to: ${path.join(runDir(input, name), '<your-agent-id>.json')}`);
    return;
  }

  if (cmd === 'api') {
    const dir = runDir(input, name);
    await mkdir(dir, { recursive: true });
    process.env.RESEARCH_MODELS = 'gateway:openai/gpt-5.6-luna';
    const r = await runAgent({ name, office: officeLine(input), issues, run: 0 });
    const stances = Object.entries(r).map(([id, s]) => {
      const i = issueById[id as IssueId];
      return { issue: id, toward: s!.pos === 0 ? NEITHER : s!.pos < 0 ? i.l : i.r, strength: Math.abs(s!.pos) === 2 ? 'strong' : 'lean', summary: s!.text, quote: s!.quote, sourceUrl: s!.sourceUrl };
    });
    await writeFile(path.join(dir, `api-luna-${Date.now()}.json`), JSON.stringify({ stances }, null, 2));
    console.log(`api agent: ${stances.length} positions for ${name}`);
    return;
  }

  // decide
  const choices: PositionsFileInput['choices'] = [];
  const needs: string[] = [];
  const hosts = new Set<string>();
  for (const ch of input.choices) {
    const raws = await readRuns(runDir(input, ch.name));
    const runs = await Promise.all(raws.map((r) => verify(r, issues)));
    if (runs.length < FIRST_ROUND) { needs.push(`${ch.name}: ${FIRST_ROUND - runs.length} more (have ${runs.length})`); continue; }
    const stances: NonNullable<PositionsFileInput['choices'][number]['stances']> = {};
    const open: IssueId[] = [];
    for (const id of issues) {
      const d = decide(id, runs);
      if (d === null) { open.push(id); continue; }
      if (!d.stance) continue;
      const i = issueById[id];
      stances[id] = { toward: d.stance.pos === 0 ? NEITHER : d.stance.pos < 0 ? i.l : i.r, strength: Math.abs(d.stance.pos) === 2 ? 'strong' : 'lean', text: d.stance.text, quote: d.stance.quote, sourceUrl: d.stance.sourceUrl, agreement: d.agreement };
      hosts.add(new URL(d.stance.sourceUrl).hostname.replace(/^www\./, ''));
    }
    // Unsettled after the first round: 2 more agents. Still unsettled after 5: leave it blank.
    if (open.length && runs.length < 5) { needs.push(`${ch.name}: ${5 - runs.length} more (unsettled: ${open.join(', ')})`); continue; }
    choices.push({ name: ch.name, party: ch.party, stances });
  }
  if (needs.length) {
    console.log(`NEED ${needs.join(' | ')}`);
    process.exit(2);
  }
  const out: PositionsFileInput = {
    office: input.office, district: input.district, division: input.division, kind: 'candidate',
    issues, choices, sources: [...hosts].join(' · '), checkedAt: new Date().toISOString().slice(0, 10), reviewed: false,
  };
  await mkdir(POSITIONS_DIR, { recursive: true });
  const dest = path.join(POSITIONS_DIR, `${contestKey(input.office, input.district)}.json`);
  await writeFile(dest, JSON.stringify(out, null, 2) + '\n');
  console.log(`WROTE ${dest}: ${choices.map((c) => `${c.name} ${Object.keys(c.stances ?? {}).length}`).join(', ')}`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
