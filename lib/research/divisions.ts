// Maps an office on a state's candidate list to the district key voters are
// matched by (see lib/address/census.ts), e.g. "U.S. Representative, District 10"
// in CA → "ca/cd-10".

export type Level = 'federal' | 'statewide' | 'legislature' | 'measures';

const num = (s: string) => /(\d+)/.exec(s)?.[1];

export function divisionFor(state: string, office: string, district?: string): string | null {
  const st = state.toLowerCase();
  const o = `${office} ${district ?? ''}`.toLowerCase();
  const n = num(district ?? '') ?? num(office);
  if (/u\.?\s?s\.?\s*senat|united states senat/.test(o)) return `${st}/state`;
  if (/u\.?\s?s\.?\s*(house|rep)|united states rep|congress/.test(o)) return n ? `${st}/cd-${Number(n)}` : `${st}/cd-at-large`;
  if (/state senat|senate district|senator,? district/.test(o)) return n ? `${st}/sldu-${Number(n)}` : null;
  if (/assembly|state house|house of (delegates|representatives)|state rep|house district|legislative district/.test(o)) return n ? `${st}/sldl-${Number(n)}` : null;
  if (/governor|attorney general|secretary of state|treasurer|controller|comptroller|auditor|insurance commissioner|superintendent of public instruction|lieutenant/.test(o)) return `${st}/state`;
  return null;
}

export function levelFor(office: string): Level {
  const o = office.toLowerCase();
  if (/u\.?\s?s\.?|united states|congress/.test(o)) return 'federal';
  if (/state senat|assembly|state house|house of delegates|state rep|legislat|senate district|house district/.test(o)) return 'legislature';
  return 'statewide';
}

/** A stable name for the office, so "U.S. Representative" and "U.S. House" count as the same contest. */
export function canonicalOffice(office: string): string {
  const o = office.toLowerCase();
  if (/u\.?\s?s\.?\s*senat|united states senat/.test(o)) return 'us-senate';
  if (/u\.?\s?s\.?\s*(house|rep)|united states rep|congress/.test(o)) return 'us-house';
  if (/state senat|senate district/.test(o)) return 'state-senate';
  if (/assembly|state house|house of delegates|state rep|house district/.test(o)) return 'state-house';
  return o.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
