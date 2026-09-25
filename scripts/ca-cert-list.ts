// Reads California's official certified list of candidates (Secretary of State PDF)
// and writes one research input per contest to data/research/ca/. Free: no AI.
//
//   npm run ca:list -- [--only legislature|federal|statewide]
//
// Needs `pdftotext` (poppler). The PDF is saved in data/sources/.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { contestKey } from '../lib/ballot/positions';
import { divisionFor, levelFor } from '../lib/research/divisions';

const PDF_URL = 'https://elections.cdn.sos.ca.gov/statewide-elections/2026-general/cert-list-candidates.pdf';
const PDF = path.join('data', 'sources', 'ca-2026-cert-list.pdf');
const PARTIES = 'Democratic|Republican|Non-Partisan|No Party Preference|Green|Libertarian|Peace and Freedom|American Independent';

export interface ListedContest { office: string; district?: string; candidates: { name: string; party: string; incumbent: boolean }[] }

export function parseCertList(text: string): ListedContest[] {
  const header = /^\s{20,}(United States Representative|State Senate|State Assembly Member|Board of Equalization Member) District (\d+)\s*$|^\s{20,}(Governor|Lieutenant Governor|Secretary of State|Controller|Treasurer|Attorney General|Insurance Commissioner|Superintendent of Public Instruction|United States Senator)\s*$/;
  const candidate = new RegExp(`^\\s{2,}(\\S.*?)(\\*)?\\s{3,}(${PARTIES})\\s*$`);
  const out: ListedContest[] = [];
  let cur: ListedContest | null = null;
  for (const line of text.split('\n')) {
    const h = header.exec(line);
    if (h) {
      cur = h[1] ? { office: h[1] === 'State Assembly Member' ? 'State Assembly' : h[1] === 'United States Representative' ? 'U.S. Representative' : h[1], district: `District ${h[2]}`, candidates: [] } : { office: h[3], candidates: [] };
      out.push(cur);
      continue;
    }
    const c = candidate.exec(line);
    if (c && cur) cur.candidates.push({ name: c[1].trim(), party: c[3], incumbent: !!c[2] });
  }
  return out.filter((c) => c.candidates.length);
}

async function main() {
  const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
  if (!existsSync(PDF)) {
    await mkdir(path.dirname(PDF), { recursive: true });
    execFileSync('curl', ['-s', '-o', PDF, PDF_URL]);
  }
  const text = execFileSync('pdftotext', ['-layout', PDF, '-'], { maxBuffer: 20 * 1024 * 1024 }).toString();
  const contests = parseCertList(text);
  const dir = path.join('data', 'research', 'ca');
  await mkdir(dir, { recursive: true });
  let written = 0;
  for (const c of contests) {
    if (only && levelFor(c.office) !== only) continue;
    const division = divisionFor('CA', c.office, c.district);
    if (!division) continue;
    const district = c.district ? `CA ${c.district}` : 'CA';
    const input = { office: c.office, district, division, kind: 'candidate', choices: c.candidates.map(({ name, party, incumbent }) => ({ name, party, incumbent })) };
    await writeFile(path.join(dir, `${contestKey(c.office, district)}.json`), JSON.stringify(input, null, 2) + '\n');
    written++;
  }
  console.log(`${contests.length} contests on the list; wrote ${written} research inputs to ${dir}`);
}

if (process.argv[1]?.endsWith('ca-cert-list.ts')) main();
