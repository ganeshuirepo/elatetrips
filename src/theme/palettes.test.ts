import { describe, it, expect } from 'vitest';
import { PALETTES, THEME_IDS, paletteToCssVars } from './palettes';

describe('palettes', () => {
  it('exposes the single luxury theme', () => {
    expect(THEME_IDS).toEqual(['luxury']);
  });

  it('maps a palette to the ten CSS custom properties', () => {
    const vars = paletteToCssVars(PALETTES.luxury);
    expect(vars['--primary']).toBe('#0A2A2C');
    expect(vars['--accent']).toBe('#E7C572');
    expect(vars['--bg-image']).toBe('none');
    expect(Object.keys(vars)).toHaveLength(10);
  });
});
