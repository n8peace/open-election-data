// Builds the free, static API published to GitHub Pages on every push to main.
//
//   npm run build:api      # writes dist/
//
//   /v1/index.json                    what's here, counts, license
//   /v1/issues.json                   the 18 issues and how each side is worded
//   /v1/all.json                      every contest in one file
//   /v1/contests/<id>.json            one contest
//   /v1/divisions/<state>/<key>.json  the contests for one district, e.g. /v1/divisions/ca/cd-10.json
//   /schema.json                      JSON Schema for a contest file

import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ISSUES } from '../lib/issues';
import { loadPositions } from '../lib/ballot/positions';
import { levelFor } from '../lib/research/divisions';

const OUT = 'dist';
const REPO = 'https://github.com/n8peace/open-election-data';
const LICENSE = {
  data: 'ODbL-1.0 (Open Database License). Use it for anything, including commercial products; credit Open Election Data and share improvements to the database under the same license.',
  quotes: 'Quotes belong to the people and publications quoted and are included as short excerpts with their sources.',
  attribution: `Candidate positions from Open Election Data (${REPO}), ODbL.`,
};

const write = async (p: string, data: unknown) => {
  await mkdir(path.dirname(path.join(OUT, p)), { recursive: true });
  await writeFile(path.join(OUT, p), JSON.stringify(data));
};

async function main() {
  await rm(OUT, { recursive: true, force: true });
  const files = await loadPositions();
  const generatedAt = new Date().toISOString();
  const contests = [...files].map(([id, f]) => ({ id, level: f.kind === 'measure' ? 'measures' : levelFor(f.office), ...f }));

  const byDivision = new Map<string, typeof contests>();
  for (const c of contests) if (c.division) byDivision.set(c.division, [...(byDivision.get(c.division) ?? []), c]);

  await write('v1/issues.json', { generatedAt, issues: ISSUES });
  await write('v1/all.json', { generatedAt, license: LICENSE, issues: ISSUES, contests });
  for (const c of contests) await write(`v1/contests/${c.id}.json`, { generatedAt, license: LICENSE, contest: c });
  for (const [division, cs] of byDivision) await write(`v1/divisions/${division}.json`, { generatedAt, division, contests: cs });
  await write('v1/index.json', {
    name: 'Open Election Data',
    description: 'Candidates and ballot measures for the Nov 3, 2026 U.S. election, placed on 18 issues. Every position is backed by an exact quote, verified against its source, that independent AI agents agreed on.',
    generatedAt,
    source: REPO,
    license: LICENSE,
    counts: { contests: contests.length, divisions: byDivision.size, states: new Set(contests.map((c) => c.division?.slice(0, 2)).filter(Boolean)).size },
    endpoints: ['/v1/issues.json', '/v1/all.json', '/v1/contests/{id}.json', '/v1/divisions/{state}/{key}.json', '/schema.json'],
  });
  await cp('data/positions.schema.json', path.join(OUT, 'schema.json'));
  await cp('site/index.html', path.join(OUT, 'index.html'));
  console.log(`dist/: ${contests.length} contests in ${byDivision.size} districts`);
}

main().catch((e) => { console.error(e); process.exit(1); });
