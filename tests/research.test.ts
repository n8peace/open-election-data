import { describe, expect, it } from 'vitest';
import { htmlToText, quoteIsInSource } from '../lib/ai/research';
import { issuesForOffice } from '../lib/ballot/offices';
import { nameKey } from '../lib/ballot/positions';

describe('research quote check', () => {
  const sources = [{ url: 'https://a.test', text: htmlToText('<p>I voted for the  “Housing Now” act in 2025.</p><script>x()</script>') }];

  it('accepts a quote that appears in the source, ignoring spacing and curly quotes', () => {
    expect(quoteIsInSource('voted for the "Housing Now" act', 'https://a.test', sources)).toBe(true);
  });
  it('rejects a quote that is not in the source', () => {
    expect(quoteIsInSource('voted against the Housing Now act', 'https://a.test', sources)).toBe(false);
  });
  it('rejects a quote attributed to the wrong source', () => {
    expect(quoteIsInSource('voted for the "Housing Now" act', 'https://b.test', sources)).toBe(false);
  });
  it('rejects quotes too short to prove anything', () => {
    expect(quoteIsInSource('voted', 'https://a.test', sources)).toBe(false);
  });
});

describe('sides, not signs', () => {
  it('converts a named side to the right end of the dial', async () => {
    const { toPosition } = await import('../lib/issues');
    expect(toPosition('schools', 'district public schools', 'strong')).toBe(2);
    expect(toPosition('schools', 'School choice', 'lean')).toBe(-1);
    expect(toPosition('schools', 'neither side', 'strong')).toBe(0);
    expect(toPosition('schools', 'vouchers are bad', 'strong')).toBeNull();
  });
});

describe('ballot plumbing', () => {
  it('maps offices to the issues they decide', () => {
    expect(issuesForOffice('School Board Trustee Place 2')).toEqual(['schools', 'tax']);
    expect(issuesForOffice('Justice, Supreme Court Place 4')).toEqual(['judicial']);
    expect(issuesForOffice('U.S. Representative, District 7')).toContain('abortion');
  });
  it('matches candidate names regardless of order and punctuation', () => {
    expect(nameKey('Kessler, Ruth A.')).toBe(nameKey('Ruth A Kessler'));
  });
});

describe('research consensus', () => {
  type R = import('../lib/research/consensus').AgentResult;
  const s = (pos: -2 | -1 | 0 | 1 | 2) => ({ pos, text: 'x', quote: 'a quote long enough', sourceUrl: 'https://a.test' });
  const none = (n: number): R[] => [...Array(n)].map(() => ({}));
  const many = (n: number, pos: -2 | -1 | 0 | 1 | 2): R[] => [...Array(n)].map(() => ({ guns: s(pos) }));
  it('settles when all 3 agents find the same side', async () => {
    const { decide } = await import('../lib/research/consensus');
    const d = decide('housing', [{ housing: s(2) }, { housing: s(1) }, { housing: s(2) }]);
    expect(d).toMatchObject({ outcome: 'r', agreement: '3/3' });
    expect(d!.stance!.pos).toBe(2); // 2 of 3 said strong
  });
  it('settles when 2 find it and the third finds nothing, since not finding is not a vote against', async () => {
    const { decide } = await import('../lib/research/consensus');
    expect(decide('housing', [{ housing: s(1) }, { housing: s(1) }, {}])).toMatchObject({ outcome: 'r', agreement: '2/3' });
  });
  it('escalates when agents conflict, or only one found anything', async () => {
    const { needsEscalation } = await import('../lib/research/consensus');
    expect(needsEscalation(['housing'], [{ housing: s(2) }, { housing: s(-1) }, {}])).toBe(true);
    expect(needsEscalation(['housing'], [{ housing: s(2) }, {}, {}])).toBe(true);
    expect(needsEscalation(['housing'], none(3))).toBe(false);
  });
  it('after 10 agents, publishes the majority of agents that found a position (3 minimum), or leaves it blank', async () => {
    const { decide } = await import('../lib/research/consensus');
    expect(decide('guns', [...many(5, -1), ...many(1, 1), ...none(4)])).toMatchObject({ outcome: 'l', agreement: '5/10' });
    expect(decide('guns', [...many(3, -1), ...many(3, 1), ...none(4)])).toBeNull();
    expect(decide('guns', [...many(2, -1), ...none(8)])).toBeNull();
    // An agent failed, so only 9 ran: still the full-round rule, so 2 finds aren't enough.
    expect(decide('guns', [...many(2, -1), ...none(7)])).toBeNull();
  });
});

describe('state batch research', () => {
  it('maps offices on a candidate list to the districts voters are matched by', async () => {
    const { divisionFor, canonicalOffice } = await import('../lib/research/divisions');
    expect(divisionFor('CA', 'U.S. Representative', 'District 10')).toBe('ca/cd-10');
    expect(divisionFor('CA', 'United States Senator')).toBe('ca/state');
    expect(divisionFor('CA', 'State Senator', 'District 09')).toBe('ca/sldu-9');
    expect(divisionFor('CA', 'Member of the State Assembly', 'District 15')).toBe('ca/sldl-15');
    expect(divisionFor('TX', 'State Representative', 'District 47')).toBe('tx/sldl-47');
    expect(divisionFor('CA', 'Governor')).toBe('ca/state');
    expect(divisionFor('CA', 'County Sheriff')).toBeNull();
    expect(canonicalOffice('U.S. House')).toBe(canonicalOffice('U.S. Representative'));
  });
});

describe('escalation size', () => {
  it('tells real disagreement apart from sparse finds', async () => {
    const { hasConflict } = await import('../lib/research/consensus');
    const s = (pos: -2 | -1 | 0 | 1 | 2) => ({ pos, text: 'x', quote: 'a quote long enough', sourceUrl: 'https://a.test' });
    expect(hasConflict(['guns'], [{ guns: s(-1) }, { guns: s(1) }, {}])).toBe(true);
    expect(hasConflict(['guns'], [{ guns: s(-1) }, {}, {}])).toBe(false);
  });
});

describe('at-large House seats', () => {
  it('use one district key, matching what voter addresses resolve to', async () => {
    const { divisionFor } = await import('../lib/research/divisions');
    expect(divisionFor('WY', 'U.S. Representative', 'At-Large')).toBe('wy/cd-at-large');
  });
});

describe('waiting for a plan to reset', () => {
  it('reads the reset time from the limit message', async () => {
    const { msUntilReset } = await import('../lib/research/agent');
    const now = new Date(2026, 8, 25, 3, 0);
    expect(msUntilReset('ERROR: ... or try again at 4:33 AM.', now)).toBe(94 * 60 * 1000);
    expect(msUntilReset('ERROR: ... try again at 1:00 AM.', now)).toBe((22 * 60 + 1) * 60 * 1000);
    expect(msUntilReset('Claude Code returned no result', now)).toBe(20 * 60 * 1000);
  });
});
