import type { IssueId } from '../issues';

// Which issues an office actually decides. Used to decide which dials count for
// a contest, and which issues the research step looks for.
const FEDERAL: IssueId[] = ['tax', 'wages', 'trade', 'debt', 'housing', 'schools', 'safety', 'immigration', 'guns', 'abortion', 'gender', 'cannabis', 'health', 'energy', 'voting'];
const STATEWIDE: IssueId[] = ['tax', 'wages', 'housing', 'schools', 'safety', 'sentencing', 'immigration', 'guns', 'abortion', 'gender', 'cannabis', 'health', 'energy', 'voting'];
const COUNTY: IssueId[] = ['tax', 'housing', 'safety', 'transit', 'immigration'];
const CITY: IssueId[] = ['tax', 'housing', 'safety', 'transit'];

export function issuesForOffice(office: string): IssueId[] {
  const o = office.toLowerCase();
  if (/supreme court|court of appeals|appellate/.test(o)) return ['judicial'];
  if (/judge|court|justice/.test(o)) return ['sentencing'];
  if (/sheriff/.test(o)) return ['safety', 'immigration'];
  if (/district attorney|prosecut/.test(o)) return ['safety', 'sentencing', 'immigration'];
  if (/school|education|trustee/.test(o)) return ['schools', 'tax'];
  if (/u\.?s\.? (house|senate|representative)|congress|united states/.test(o)) return FEDERAL;
  if (/president/.test(o)) return [...FEDERAL, 'judicial'];
  if (/county|commissioner|supervisor/.test(o)) return COUNTY;
  if (/mayor|city council|council member|alder/.test(o)) return CITY;
  if (/governor|state (senate|house|representative|assembly)|legislat|attorney general/.test(o)) return STATEWIDE;
  return STATEWIDE;
}
