/**
 * Celebration palettes. Each palette maps 1:1 to a set of CSS custom properties
 * consumed by both Tailwind (via globals.css) and the MUI theme.
 * 'classic' preserves the original ElateTrips styling.
 *
 * Ported verbatim from `ElateTrips First Page.dc.html` (THEMES).
 */

export type ThemeId = 'lagoon' | 'sunset' | 'classic' | 'rose' | 'emerald';

export interface Palette {
  label: string;
  primary: string;
  accent: string;
  accentInk: string;
  sand: string;
  line: string;
  ink: string;
  muted: string;
  bg1: string;
  bg2: string;
  /** Travel photo shown faintly behind the theme gradient (under /public). */
  bgImage: string;
}

export const PALETTES: Record<ThemeId, Palette> = {
  lagoon: {
    label: 'Lagoon',
    primary: '#0F7C8B',
    accent: '#FF7A55',
    accentInk: '#C9492A',
    sand: '#E3F1F0',
    line: '#D1E5E3',
    ink: '#16242A',
    muted: '#51666B',
    bg1: '#F1FAF9',
    bg2: '#E1F0EE',
    bgImage: '/assets/bg-lagoon.jpg',
  },
  sunset: {
    label: 'Sunset',
    primary: '#C0306B',
    accent: '#F5A524',
    accentInk: '#B0710F',
    sand: '#FBE7DA',
    line: '#F0D8C8',
    ink: '#2A1C22',
    muted: '#6B5860',
    bg1: '#FFF4EC',
    bg2: '#FCE5D8',
    bgImage: '/assets/bg-sunset.jpg',
  },
  classic: {
    label: 'Classic',
    primary: '#1C3C8F',
    accent: '#E07B2D',
    accentInk: '#B96212',
    sand: '#F4ECDD',
    line: '#E4E0D7',
    ink: '#1F2433',
    muted: '#5B6678',
    bg1: '#FCF6EC',
    bg2: '#F5EDDF',
    bgImage: '/assets/bg-classic.jpg',
  },
  rose: {
    label: 'Rose Soirée',
    primary: '#8E2F57',
    accent: '#E08AA6',
    accentInk: '#B05576',
    sand: '#F6E7EC',
    line: '#ECDDE2',
    ink: '#2A1F26',
    muted: '#6B5A62',
    bg1: '#FCF2F5',
    bg2: '#F7E9EE',
    bgImage: '/assets/bg-rose.jpg',
  },
  emerald: {
    label: 'Emerald Fête',
    primary: '#1E6B54',
    accent: '#CDA24A',
    accentInk: '#8F6E1E',
    sand: '#E9EFE6',
    line: '#DCE6D8',
    ink: '#1E261F',
    muted: '#566159',
    bg1: '#F6F9F2',
    bg2: '#EDF3E8',
    bgImage: '/assets/bg-emerald.jpg',
  },
};

export const THEME_IDS = Object.keys(PALETTES) as ThemeId[];
export const DEFAULT_THEME: ThemeId = 'classic';

/** Map a palette to the CSS custom properties used across the app. */
export function paletteToCssVars(p: Palette): Record<string, string> {
  return {
    '--primary': p.primary,
    '--accent': p.accent,
    '--accent-ink': p.accentInk,
    '--sand': p.sand,
    '--line': p.line,
    '--ink': p.ink,
    '--muted': p.muted,
    '--bg1': p.bg1,
    '--bg2': p.bg2,
    '--bg-image': `url(${p.bgImage})`,
  };
}
