import { describe, expect, it } from 'vitest';
import { CCD_NAMES, ccdDivision } from '../lib/research/ccd';

describe('ccdDivision', () => {
  it('maps registrar names to the boundary layer key', () => {
    expect(ccdDivision('San Mateo County Community College District')).toBe('ca/ccd-san-mateo-county');
    expect(ccdDivision('Sonoma County Junior College District')).toBe('ca/ccd-sonoma-county');
    expect(ccdDivision('Shasta-Tehama-Trinity Joint Community College District')).toBe('ca/ccd-shasta-tehama-trinity');
    expect(ccdDivision('Mount San Antonio Community College District')).toBe('ca/ccd-mt-san-antonio');
    expect(ccdDivision('Foothill-De Anza Community College District')).toBe('ca/ccd-foothill-deanza');
  });
  it('returns null for unknown or non-college names', () => {
    expect(ccdDivision('Shasta Tehama Joint Community College District')).toBeNull();
    expect(ccdDivision('Mount Diablo Unified School District')).toBeNull();
  });
  it('gives every district its own key', () => {
    const keys = CCD_NAMES.map((n) => ccdDivision(`${n} Community College District`));
    expect(keys.every(Boolean)).toBe(true);
    expect(new Set(keys).size).toBe(CCD_NAMES.length);
  });
});
