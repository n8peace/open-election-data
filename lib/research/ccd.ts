// California community college districts, by the names in the state's boundary layer
// (California Community Colleges, "CCD Boundaries", data.ca.gov). Plain Ballot matches a
// voter to one of these by location and keys it `ca/ccd-<slug>`, so a measure's division
// must use the same slug.
export const CCD_NAMES = [
  'Allan Hancock', 'Antelope Valley', 'Barstow', 'Butte-Glenn', 'Cabrillo', 'Cerritos', 'Chabot-Las Positas', 'Chaffey',
  'Citrus', 'Coast', 'Compton', 'Contra Costa', 'Copper Mountain', 'Desert', 'El Camino', 'Feather River', 'Foothill-DeAnza',
  'Gavilan', 'Glendale', 'Grossmont-Cuyamaca', 'Hartnell', 'Imperial', 'Kern', 'Lake Tahoe', 'Lassen', 'Long Beach',
  'Los Angeles', 'Los Rios', 'Marin', 'Mendocino-Lake', 'Merced', 'MiraCosta', 'Monterey Peninsula', 'Mt. San Antonio',
  'Mt. San Jacinto', 'Napa Valley', 'North Orange County', 'Ohlone', 'Palo Verde', 'Palomar', 'Pasadena Area', 'Peralta',
  'Rancho Santiago', 'Redwoods', 'Rio Hondo', 'Riverside', 'San Bernardino', 'San Diego', 'San Francisco', 'San Joaquin Delta',
  'San Jose-Evergreen', 'San Luis Obispo County', 'San Mateo County', 'Santa Barbara', 'Santa Clarita', 'Santa Monica',
  'Sequoias', 'Shasta-Tehama-Trinity', 'Sierra Joint', 'Siskiyou Joint', 'Solano', 'Sonoma County', 'South Orange County',
  'Southwestern', 'State Center', 'Ventura County', 'Victor Valley', 'West Hills', 'West Kern', 'West Valley-Mission',
  'Yosemite', 'Yuba',
] as const;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const letters = (s: string) =>
  s.toLowerCase()
    .replace(/\b(community|junior)?\s*college district\b.*$/, '')
    .replace(/\b(joint|the|of|mount|mt)\b/g, '')
    .replace(/[^a-z]/g, '');
const BY_LETTERS = new Map(CCD_NAMES.map((n) => [letters(n), n]));

/** "San Mateo County Community College District" → "ca/ccd-san-mateo-county"; null when the name isn't one of the 72. */
export function ccdDivision(jurisdiction: string): string | null {
  if (!/college district/i.test(jurisdiction)) return null;
  const name = BY_LETTERS.get(letters(jurisdiction));
  return name ? `ca/ccd-${slug(name)}` : null;
}
