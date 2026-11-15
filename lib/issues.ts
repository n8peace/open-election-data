// The issue list and dial wording. This file is the public, auditable heart of
// the method: each end of a dial is worded the way its own supporters would say
// it, and the ends are deliberately not all lined up left-to-right by party.
//
// Position scale: -2 = strongly toward `left`, 0 = no strong view, 2 = strongly toward `right`.

export const GROUPS = [
  'Money & work',
  'Your community',
  'Safety & justice',
  'Rights & values',
  'Health & environment',
  'Democracy & courts',
] as const;

export const ISSUES = [
  { id: 'tax', g: 0, name: 'Taxes & services', left: 'Keep taxes low, even if services shrink', right: 'Fund more services, even if taxes rise', l: 'lower taxes', r: 'more services' },
  { id: 'wages', g: 0, name: 'Wages & workers', left: 'Raise the minimum wage and strengthen unions', right: 'Let employers and the market set wages', l: 'higher wage floors', r: 'market-set wages' },
  { id: 'trade', g: 0, name: 'Trade & tariffs', left: 'Use tariffs to protect U.S. jobs and industry', right: 'Trade more freely for lower prices', l: 'tariffs', r: 'freer trade' },
  { id: 'debt', g: 0, name: 'Debt & retirement', left: 'Protect Social Security and Medicare as they are', right: 'Shrink the debt, even if benefits change', l: 'protecting benefits', r: 'shrinking the debt' },
  { id: 'housing', g: 1, name: 'Housing', left: 'Grow slowly and protect neighborhood character', right: 'Build more housing and loosen zoning', l: 'slower growth', r: 'building more housing' },
  { id: 'schools', g: 1, name: 'Schools', left: 'Expand school choice and vouchers', right: 'Keep funding in district public schools', l: 'school choice', r: 'district public schools' },
  { id: 'transit', g: 1, name: 'Getting around', left: 'Put roads and driving first', right: 'Put transit, biking and walking first', l: 'roads first', r: 'transit first' },
  { id: 'safety', g: 2, name: 'Policing', left: 'Put more money into police and enforcement', right: 'Put more money into prevention and alternatives', l: 'more enforcement', r: 'more prevention' },
  { id: 'sentencing', g: 2, name: 'Criminal sentencing', left: 'More alternatives to prison for nonviolent crimes', right: 'Tougher sentences and fewer early releases', l: 'alternatives to prison', r: 'tougher sentences' },
  { id: 'immigration', g: 2, name: 'Immigration', left: 'Stricter enforcement and more deportations', right: 'More legal pathways and protections', l: 'stricter enforcement', r: 'more legal pathways' },
  { id: 'guns', g: 2, name: 'Guns', left: 'Stricter gun laws, like universal background checks', right: 'Fewer restrictions on gun owners', l: 'stricter gun laws', r: 'fewer restrictions' },
  { id: 'abortion', g: 3, name: 'Abortion', left: 'Protect legal access to abortion', right: 'Restrict abortion to protect unborn life', l: 'protecting access', r: 'restricting abortion' },
  { id: 'gender', g: 3, name: 'Gender identity in sports and schools', left: 'Rules based on sex at birth', right: 'Rules based on gender identity', l: 'rules based on sex at birth', r: 'rules based on gender identity' },
  { id: 'cannabis', g: 3, name: 'Marijuana', left: 'Keep it illegal', right: 'Legalize and regulate it', l: 'keeping it illegal', r: 'legalizing it' },
  { id: 'health', g: 4, name: 'Health care', left: 'Expand public coverage, like Medicare and Medicaid', right: 'More private insurance and competition', l: 'public coverage', r: 'private insurance' },
  { id: 'energy', g: 4, name: 'Energy & climate', left: 'Keep energy cheap and protect current jobs', right: 'Cut emissions faster, even if it costs more', l: 'cheaper energy', r: 'faster emissions cuts' },
  { id: 'voting', g: 5, name: 'Voting rules', left: 'Make voting easier: mail ballots, same-day registration', right: 'Tighten rules: stricter ID and voter-roll checks', l: 'easier voting', r: 'tighter rules' },
  { id: 'judicial', g: 5, name: 'How judges read the law', left: 'Follow the original meaning of the text', right: 'Apply the law in light of changing times', l: 'original meaning', r: 'changing times' },
] as const;

export type Issue = (typeof ISSUES)[number];
export type IssueId = Issue['id'];
export const ISSUE_IDS = ISSUES.map((i) => i.id) as [IssueId, ...IssueId[]];
export const issueById = Object.fromEntries(ISSUES.map((i) => [i.id, i])) as Record<IssueId, Issue>;

export type Position = -2 | -1 | 0 | 1 | 2;
export type Importance = 'low' | 'medium' | 'high';
export const WEIGHT: Record<Importance, number> = { low: 1, medium: 2, high: 3 };

// Models never write signed numbers. They name the side in words ("toward") and a
// strength, and we convert here. This removes a class of errors where a model
// flips the sign and puts someone on the opposite end of a dial.

export const NEITHER = 'neither side';

export function sideGuide(ids: readonly IssueId[]): string {
  return ids
    .map((id) => {
      const i = issueById[id];
      return `- ${id} (${i.name}): "${i.l}" = ${i.left}; "${i.r}" = ${i.right}`;
    })
    .join('\n');
}

export function toPosition(id: IssueId, toward: string, strength: 'lean' | 'strong'): Position | null {
  const i = issueById[id];
  const t = toward.trim().toLowerCase().replace(/^["']|["']$/g, '');
  const mag = strength === 'strong' ? 2 : 1;
  if (t === i.l.toLowerCase()) return -mag as Position;
  if (t === i.r.toLowerCase()) return mag as Position;
  if (t === NEITHER) return 0;
  return null;
}

export function readout(i: Issue, v: number): string {
  if (v === 0) return 'No strong view';
  return (Math.abs(v) === 2 ? 'Strongly: ' : 'Lean: ') + (v < 0 ? i.l : i.r);
}

export function leanPhrase(i: Issue, v: number): string {
  if (v === 0) return `have no strong view on ${i.name.toLowerCase()}`;
  return `${Math.abs(v) === 2 ? 'strongly favor' : 'lean toward'} ${v < 0 ? i.l : i.r}`;
}
