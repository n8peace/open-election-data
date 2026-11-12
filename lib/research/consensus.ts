// Deciding what goes on the ballot when several independent research agents
// look at the same candidate. Pure logic, no AI, so it's easy to test and audit.
//
// Each agent either found a verified, quoted position on an issue (a side, or
// "neither") or found nothing. Finding nothing is not a vote against: sources are
// hard to find, and one agent missing a page doesn't make the others wrong.
//
//  - First round, 3 agents: settled if at least 2 found the same side and none
//    found a different side. Settled as blank if none found anything.
//  - Otherwise 7 more agents run (10 total). A side is published only if at least
//    3 agents found it and it's a majority of the agents that found any position.
//    Otherwise the issue is left blank. We never guess.

import type { IssueId } from '../issues';
import type { ResearchedStance } from '../ai/research';

export type Outcome = 'l' | 'r' | 'neither' | 'none';
export const FIRST_ROUND = 3;
export const FULL_ROUND = 10;

export type AgentResult = Partial<Record<IssueId, ResearchedStance>>;

export function outcomeOf(s: ResearchedStance | undefined): Outcome {
  if (!s) return 'none';
  return s.pos === 0 ? 'neither' : s.pos < 0 ? 'l' : 'r';
}

export interface Decision {
  outcome: Outcome;
  /** e.g. "3/3" or "7/10": how many agents found this position, out of how many ran. */
  agreement: string;
  /** The stance used for display (a verified quote from an agent in the majority). */
  stance?: ResearchedStance;
}

/** Shared category threshold: abstentions do not count as disagreement. */
export function decideCategory<T extends string>(answers: (T | undefined)[]): { value: T; agreement: string } | null {
  const found = answers.filter((a): a is T => a !== undefined);
  if (!found.length) return null;
  const counts = new Map<T, number>();
  for (const answer of found) counts.set(answer, (counts.get(answer) ?? 0) + 1);
  const [value, winners] = [...counts].sort((a, b) => b[1] - a[1])[0];
  const settled = answers.length > FIRST_ROUND
    ? winners >= 3 && winners > found.length / 2
    : winners >= 2 && winners === found.length;
  return settled ? { value, agreement: `${winners}/${answers.length}` } : null;
}

/** Returns the decision, or null if the agents haven't settled it (escalate, or leave blank after 10). */
export function decide(issue: IssueId, runs: AgentResult[]): Decision | null {
  const found = runs.map((r) => r[issue]).filter((s): s is ResearchedStance => !!s);
  if (!found.length) return { outcome: 'none', agreement: `0/${runs.length}` };
  const tally = new Map<Outcome, ResearchedStance[]>();
  for (const s of found) tally.set(outcomeOf(s), [...(tally.get(outcomeOf(s)) ?? []), s]);
  const [top, winners] = [...tally.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  const category = decideCategory(runs.map((r) => r[issue] ? outcomeOf(r[issue]) : undefined));
  if (!category) return null;
  // Strength: "strong" only if most agreeing agents said strong.
  const strong = winners.filter((s) => Math.abs(s.pos) === 2).length > winners.length / 2;
  const sign = top === 'l' ? -1 : top === 'r' ? 1 : 0;
  return { outcome: top, agreement: category.agreement, stance: { ...winners[0], pos: (sign * (strong ? 2 : 1)) as ResearchedStance['pos'] } };
}

/** True when the first round left any issue unsettled and more agents are needed. */
export function needsEscalation(issues: IssueId[], runs: AgentResult[]): boolean {
  return issues.some((id) => decide(id, runs) === null);
}

/** True when agents found opposite positions on an issue (not just some finding nothing). */
export function hasConflict(issues: IssueId[], runs: AgentResult[]): boolean {
  return issues.some((id) => new Set(runs.map((r) => r[id]).filter(Boolean).map((s) => outcomeOf(s))).size > 1);
}
