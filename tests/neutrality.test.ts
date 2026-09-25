// Neutrality guarantees for the research, checked on every change. If one fails, the
// change treats one side differently from the other. (Matching is tested in plainballot.)

import { describe, expect, it } from 'vitest';
import { ISSUES, NEITHER, toPosition, type IssueId, type Position } from '../lib/issues';
import { decide, type AgentResult } from '../lib/research/consensus';

describe('dial wording is balanced', () => {
  const LOADED = /\b(radical|extreme|extremist|common[- ]sense|woke|illegal alien|baby[- ]kill|gun[- ]grab|socialis[mt]|fascis[mt]|job[- ]kill|anti-?(science|family|american))/i;

  it.each(ISSUES.map((i) => [i.name, i] as const))('%s: two distinct, similar-length, unloaded ends', (_, i) => {
    expect(i.l).not.toBe(i.r);
    expect(i.left).not.toBe(i.right);
    const ratio = Math.max(i.left.length, i.right.length) / Math.min(i.left.length, i.right.length);
    expect(ratio).toBeLessThan(2.2);
    for (const text of [i.left, i.right, i.l, i.r, i.name]) expect(text).not.toMatch(LOADED);
  });

  it('reads both ends back as equal and opposite', () => {
    for (const i of ISSUES) {
      for (const s of ['lean', 'strong'] as const) expect(toPosition(i.id, i.l, s)).toBe(-toPosition(i.id, i.r, s)!);
      expect(toPosition(i.id, NEITHER, 'strong')).toBe(0);
    }
  });
});

describe('research agreement treats both sides the same', () => {
  const stance = (pos: Position) => ({ pos, text: 'Said something about it.', quote: 'a quote from the source', sourceUrl: 'https://example.org' });
  const runsOf = (id: IssueId, positions: (Position | null)[]): AgentResult[] => positions.map((p) => (p === null ? {} : { [id]: stance(p) }));
  const cases: (Position | null)[][] = [[2, 2, 1], [1, 1, null], [1, -1, 1], [2, 2, 2, 2, -1, null, null, 1, 1, 0], [1, 1, 1, -1, -1, -1, 0, null, null, null]];

  it.each(cases)('mirrored agent findings give the mirrored decision: %j', (...positions) => {
    for (const i of ISSUES) {
      const a = decide(i.id, runsOf(i.id, positions));
      const b = decide(i.id, runsOf(i.id, positions.map((p) => (p === null ? null : ((-p || 0) as Position)))));
      expect(b === null).toBe(a === null);
      if (a && b) {
        expect(b.agreement).toBe(a.agreement);
        expect(b.stance?.pos ?? 0).toBe(-(a.stance?.pos ?? 0) || 0);
      }
    }
  });
});
