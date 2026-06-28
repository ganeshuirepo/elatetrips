import { describe, it, expect } from 'vitest';
import { PALETTES, THEME_IDS, paletteToCssVars } from './palettes';

describe('palettes', () => {
  it('exposes all five celebration themes', () => {
    expect(THEME_IDS).toEqual(['lagoon', 'sunset', 'classic', 'rose', 'emerald']);
  });

  it('maps a palette to the ten CSS custom properties', () => {
    const vars = paletteToCssVars(PALETTES.classic);
    expect(vars['--primary']).toBe('#1C3C8F');
    expect(vars['--accent']).toBe('#E07B2D');
    expect(vars['--bg-image']).toBe('url(/assets/bg-classic.jpg)');
    expect(Object.keys(vars)).toHaveLength(10);
  });
});
