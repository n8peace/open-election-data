// Runs the consensus process for one candidate (or one Yes/No side of a measure):
// 3 independent agents, escalating to 10 when they disagree.

import type { IssueId } from '../issues';
import { runAgent, modelFor } from './agent';
import { decide, FIRST_ROUND, FULL_ROUND, hasConflict, needsEscalation, type AgentResult, type Decision } from './consensus';

export interface CandidateResearch {
  decisions: Partial<Record<IssueId, Decision>>;
  /** Issues where even 10 agents had no majority. Left blank. */
  split: IssueId[];
  runs: number;
  models: string[];
}

async function runMany(from: number, count: number, opts: Parameters<typeof runAgent>[0], log: (s: string) => void): Promise<AgentResult[]> {
  const out: AgentResult[] = [];
  const batch = Array.from({ length: count }, (_, i) => from + i);
  // A few at a time, to stay polite to the sites being read.
  for (let i = 0; i < batch.length; i += 4) {
    const settled = await Promise.allSettled(batch.slice(i, i + 4).map((run) => runAgent({ ...opts, run })));
    settled.forEach((r, j) => {
      const run = batch[i + j];
      if (r.status === 'fulfilled') { out.push(r.value); log(`    agent ${run + 1} (${modelFor(run)}): ${Object.keys(r.value).length} positions`); }
      else log(`    agent ${run + 1} (${modelFor(run)}) failed: ${(r.reason as Error)?.message?.slice(0, 120)}`);
    });
  }
  return out;
}

export async function researchWithConsensus(
  opts: { name: string; office: string; issues: IssueId[]; isMeasure?: boolean; seedUrls?: string[] },
  log: (s: string) => void = console.log,
): Promise<CandidateResearch> {
  const base = { ...opts, run: 0 };
  let runs = await runMany(0, FIRST_ROUND, base, log);
  if (runs.length < FIRST_ROUND) runs = runs.concat(await runMany(FIRST_ROUND, FIRST_ROUND - runs.length, base, log));
  if (needsEscalation(opts.issues, runs)) {
    // Real disagreement (opposite sides): 10 agents and a majority. Only sparse finds
    // (one agent found something, the others found nothing): 2 more agents, total 5.
    const target = hasConflict(opts.issues, runs) ? FULL_ROUND : 5;
    log(`    ${target === FULL_ROUND ? 'agents disagree' : 'only one agent found some positions'}; running ${target - runs.length} more`);
    runs = runs.concat(await runMany(runs.length, target - runs.length, base, log));
  }
  const decisions: CandidateResearch['decisions'] = {};
  const split: IssueId[] = [];
  for (const id of opts.issues) {
    const d = decide(id, runs);
    if (d) decisions[id] = d; else split.push(id);
  }
  const models = [...new Set(Array.from({ length: runs.length }, (_, i) => modelFor(i)))];
  return { decisions, split, runs: runs.length, models };
}
