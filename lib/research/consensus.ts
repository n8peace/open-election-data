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

/** Returns the decision, or null if the agents haven't settled it (escalate, or leave blank after 10). */
export function decide(issue: IssueId, runs: AgentResult[]): Decision | null {
  const found = runs.map((r) => r[issue]).filter((s): s is ResearchedStance => !!s);
  if (!found.length) return { outcome: 'none', agreement: `0/${runs.length}` };
  const tally = new Map<Outcome, ResearchedStance[]>();
  for (const s of found) tally.set(outcomeOf(s), [...(tally.get(outcomeOf(s)) ?? []), s]);
  const [top, winners] = [...tally.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  const others = found.length - winners.length;
  // Any run past the first round uses the full-round rule, even if an agent failed.
  const full = runs.length > FIRST_ROUND;
  const settled = full ? winners.length >= 3 && winners.length > found.length / 2 : winners.length >= 2 && others === 0;
  if (!settled) return null;
  // Strength: "strong" only if most agreeing agents said strong.
  const strong = winners.filter((s) => Math.abs(s.pos) === 2).length > winners.length / 2;
  const sign = top === 'l' ? -1 : top === 'r' ? 1 : 0;
  return { outcome: top, agreement: `${winners.length}/${runs.length}`, stance: { ...winners[0], pos: (sign * (strong ? 2 : 1)) as ResearchedStance['pos'] } };
}

/** True when the first round left any issue unsettled and more agents are needed. */
export function needsEscalation(issues: IssueId[], runs: AgentResult[]): boolean {
  return issues.some((id) => decide(id, runs) === null);
}

/** True when agents found opposite positions on an issue (not just some finding nothing). */
export function hasConflict(issues: IssueId[], runs: AgentResult[]): boolean {
  return issues.some((id) => new Set(runs.map((r) => r[id]).filter(Boolean).map((s) => outcomeOf(s))).size > 1);
}
