import { describe, it, expect } from 'vitest';
import { celebComboValid, validVehicleIds, pkgFitsAge, packagesForCeleb } from './rules';

describe('celebComboValid', () => {
  it('allows zero or one occasion', () => {
    expect(celebComboValid([])).toBe(true);
    expect(celebComboValid(['birthday'])).toBe(true);
    expect(celebComboValid(['wedding'])).toBe(true);
    expect(celebComboValid(['teamouting'])).toBe(true);
  });

  it('allows combinations within the Celebration group', () => {
    expect(celebComboValid(['birthday', 'anniversary'])).toBe(true);
    expect(celebComboValid(['birthday', 'anniversary', 'honeymoon', 'bachelor'])).toBe(true);
  });

  it('allows combinations within the Escapes group', () => {
    expect(celebComboValid(['family', 'adventure'])).toBe(true);
    expect(celebComboValid(['family', 'adventure', 'leisure', 'nature'])).toBe(true);
  });

  it('never combines Escapes with Celebration items', () => {
    expect(celebComboValid(['birthday', 'adventure'])).toBe(false);
    expect(celebComboValid(['anniversary', 'family'])).toBe(false);
    expect(celebComboValid(['honeymoon', 'nature'])).toBe(false);
  });

  it('treats Wedding as exclusive', () => {
    expect(celebComboValid(['wedding', 'honeymoon'])).toBe(false);
    expect(celebComboValid(['wedding', 'anniversary'])).toBe(false);
    expect(celebComboValid(['wedding', 'family'])).toBe(false);
  });

  it('treats Proposal (teamouting) as exclusive', () => {
    expect(celebComboValid(['teamouting', 'birthday'])).toBe(false);
    expect(celebComboValid(['teamouting', 'family'])).toBe(false);
  });
});

describe('validVehicleIds', () => {
  it('offers only cars for 6 or fewer travellers', () => {
    expect(validVehicleIds(4)).toEqual(['hatchback', 'sedan', 'suv']);
    expect(validVehicleIds(6)).toEqual(['suv']);
  });

  it('offers only coaches for more than 6 travellers', () => {
    expect(validVehicleIds(7)).toEqual(['tempo', 'minibus', 'bus']);
    expect(validVehicleIds(20)).toEqual(['minibus', 'bus']);
    expect(validVehicleIds(40)).toEqual(['bus']);
  });

  it('never mixes cars and coaches', () => {
    const five = validVehicleIds(5);
    expect(five).toContain('suv');
    expect(five).not.toContain('tempo');
  });
});

describe('pkgFitsAge', () => {
  it('passes unlisted packages at any age', () => {
    expect(pkgFitsAge('Custom dishes', 5)).toBe(true);
    expect(pkgFitsAge('Custom dishes', 80)).toBe(true);
  });

  it('gates kids/teen packages by upper bound', () => {
    expect(pkgFitsAge('Kids activities', 12)).toBe(true);
    expect(pkgFitsAge('Kids activities', 13)).toBe(false);
    expect(pkgFitsAge('Magician show', 15)).toBe(true);
    expect(pkgFitsAge('Magician show', 16)).toBe(false);
  });

  it('gates adult packages by lower bound', () => {
    expect(pkgFitsAge('Candlelight dinner', 17)).toBe(false);
    expect(pkgFitsAge('Candlelight dinner', 18)).toBe(true);
    expect(pkgFitsAge('Live guitarist', 12)).toBe(false);
    expect(pkgFitsAge('Live guitarist', 13)).toBe(true);
  });
});

describe('packagesForCeleb', () => {
  it('returns the full list when nothing is shown yet and no age set', () => {
    const out = packagesForCeleb('anniversary', {}, new Set());
    expect(out).toContain('Candlelight dinner');
    expect(out).toContain('In-room decoration');
  });

  it('de-duplicates against packages already shown for earlier celebrations', () => {
    const shown = new Set(['In-room decoration']);
    const out = packagesForCeleb('anniversary', {}, shown);
    expect(out).not.toContain('In-room decoration');
    expect(out).toContain('Candlelight dinner');
  });

  it('filters birthday packages by entered age', () => {
    const young = packagesForCeleb('birthday', { birthday: '8' }, new Set());
    expect(young).toContain('Kids activities');
    expect(young).not.toContain('Live guitarist'); // 13+

    const adult = packagesForCeleb('birthday', { birthday: '30' }, new Set());
    expect(adult).not.toContain('Kids activities'); // ≤12
    expect(adult).toContain('Live guitarist');
  });

  it('does not age-filter when no age is entered', () => {
    const out = packagesForCeleb('birthday', {}, new Set());
    expect(out).toContain('Kids activities');
    expect(out).toContain('Live guitarist');
  });
});
