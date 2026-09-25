import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { ISSUE_IDS, NEITHER, issueById, toPosition, type IssueId, type Position } from '../issues';

// Researched positions live as reviewable JSON files in data/positions/, written by
// `npm run research`. They publish once independent agents agree and every quote
// verifies; `reviewed: true` marks files a person has also checked.

// In the files, a stance names its side in words (the dial's short label), so a
// person writing or reviewing research can't put someone on the wrong end by
// flipping a sign. It's converted to a number when loaded.
const StanceSchema = z.object({
  toward: z.string(),
  strength: z.enum(['lean', 'strong']),
  text: z.string().min(10).max(240),
  quote: z.string().min(12),
  sourceUrl: z.url(),
  /** How many independent research agents agreed, e.g. "3/3" or "7/10". */
  agreement: z.string().regex(/^\d+\/\d+$/).optional(),
});

const StancesSchema = z.partialRecord(z.enum(ISSUE_IDS), StanceSchema).transform((rec, ctx) => {
  const out: Partial<Record<IssueId, { pos: Position; text: string; quote: string; sourceUrl: string; agreement?: string }>> = {};
  for (const [id, s] of Object.entries(rec) as [IssueId, z.infer<typeof StanceSchema>][]) {
    if (!s) continue;
    const pos = toPosition(id, s.toward, s.strength);
    if (pos === null) {
      const i = issueById[id];
      ctx.addIssue({ code: 'custom', path: [id, 'toward'], message: `"${s.toward}" isn't a side of ${i.name}. Use "${i.l}", "${i.r}" or "${NEITHER}".` });
      continue;
    }
    out[id] = { pos, text: s.text, quote: s.quote, sourceUrl: s.sourceUrl, agreement: s.agreement };
  }
  return out;
});

export const PositionsFileSchema = z.object({
  office: z.string(),
  district: z.string().optional(),
  /** Which voters see this contest, e.g. "ca/cd-10" or "ca/county-contra-costa". See lib/address/census.ts. */
  division: z.string().regex(/^[a-z]{2}\/[a-z0-9-]+$/, 'Use a division key like "ca/cd-10" or "ca/county-contra-costa"').optional(),
  kind: z.enum(['candidate', 'measure', 'retention']).default('candidate'),
  /** Measures: a plain one-sentence description of what it does. */
  summary: z.string().max(400).optional(),
  issues: z.array(z.enum(ISSUE_IDS)),
  choices: z.array(
    z.object({
      name: z.string(),
      party: z.string().optional(),
      stances: StancesSchema,
    }),
  ),
  sources: z.string().optional(),
  checkedAt: z.string(),
  reviewed: z.boolean(),
});

export type PositionsFile = z.output<typeof PositionsFileSchema>;
/** The on-disk shape (sides named in words). */
export type PositionsFileInput = z.input<typeof PositionsFileSchema>;

export const POSITIONS_DIR = path.join(process.cwd(), 'data', 'positions');

export const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const contestKey = (office: string, district?: string) => slug([office, district].filter(Boolean).join(' '));
export const nameKey = (name: string) => slug(name).split('-').filter((p) => p.length > 1).sort().join('-');

/** Loads all research files keyed by file name. */
export async function loadPositions(): Promise<Map<string, PositionsFileInput>> {
  const out = new Map<string, PositionsFileInput>();
  const files = (await readdir(POSITIONS_DIR).catch(() => [] as string[])).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort();
  for (const f of files) {
    const raw = JSON.parse(await readFile(path.join(POSITIONS_DIR, f), 'utf8'));
    if (PositionsFileSchema.safeParse(raw).success) out.set(f.replace(/\.json$/, ''), raw);
  }
  return out;
}
