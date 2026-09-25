// Builds a one-page HTML sheet of every unreviewed claim (claim, quote, source) so a
// reviewer can check them quickly.   npm run review  →  review.html
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { issueById, type IssueId } from '../lib/issues';
import { POSITIONS_DIR } from '../lib/ballot/positions';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

async function main() {
  const files = (await readdir(POSITIONS_DIR)).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort();
  let body = '';
  for (const f of files) {
    const d = JSON.parse(await readFile(path.join(POSITIONS_DIR, f), 'utf8'));
    if (d.reviewed) continue;
    body += `<h2>${esc(d.office)} · ${esc(d.district ?? '')} <small>${esc(f)}</small></h2>`;
    for (const c of d.choices) {
      const blank = (d.issues as IssueId[]).filter((id) => !c.stances[id]).map((id) => issueById[id].name);
      body += `<h3>${esc(c.name)} <small>${esc(c.party ?? '')}</small></h3><table>`;
      for (const [id, s] of Object.entries<{ toward: string; strength: string; text: string; quote: string; sourceUrl: string }>(c.stances)) {
        body += `<tr><td class="i">${esc(issueById[id as IssueId].name)}<br><b>${esc(s.strength)}: ${esc(s.toward)}</b></td><td>${esc(s.text)}<blockquote>“${esc(s.quote)}”</blockquote><a href="${esc(s.sourceUrl)}" target="_blank">${esc(new URL(s.sourceUrl).hostname)}</a></td><td class="c"><label><input type="checkbox"> OK</label></td></tr>`;
      }
      body += `</table>${blank.length ? `<p class="blank">No sourced position: ${blank.map(esc).join(', ')}</p>` : ''}`;
    }
  }
  const html = `<!doctype html><meta charset="utf-8"><title>Research review</title><style>
body{font:15px/1.45 -apple-system,system-ui,sans-serif;max-width:980px;margin:24px auto;padding:0 16px;color:#111}
h2{border-top:3px double #111;padding-top:10px;margin-top:36px}h2 small,h3 small{font-weight:400;color:#777;font-size:13px}
table{border-collapse:collapse;width:100%}td{border-top:1px solid #ddd;padding:8px 10px;vertical-align:top}
td.i{width:190px;font-size:13px}td.c{width:60px}blockquote{margin:6px 0;padding-left:10px;border-left:2px solid #111;color:#444;font-size:13px}
a{font-size:12px;color:#555}.blank{font-size:13px;color:#777}</style>
<h1>Research review</h1><p>For each claim: open the source, confirm the quote says what the claim says, and that the side of the dial is right. Anything wrong: tell Claude which one.</p>${body}`;
  await writeFile('review.html', html);
  console.log('Wrote review.html');
}
main();
