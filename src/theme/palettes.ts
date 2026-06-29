/**
 * Single luxury palette. The app uses one refined dark-teal + gold identity
 * (the theme switcher is retired). Tokens map 1:1 to CSS custom properties
 * consumed by Tailwind (via globals.css), inline styles and the MUI theme.
 *
 * Design language: deep teal canvas (#071F21), warm gold accents (#dfba6b),
 * near-black headings on light surfaces, generous serif display type.
 */

export type ThemeId = 'luxury';

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
  /** Optional photo shown faintly behind the canvas; empty = none. */
  bgImage: string;
}

export const PALETTES: Record<ThemeId, Palette> = {
  luxury: {
    label: 'Luxury',
    primary: '#0A2A2C', // deep teal — headings / brand on light surfaces
    accent: '#E7C572', // bright warm gold — accents, selected states, CTAs
    accentInk: '#9C7C33', // darker gold — gold text on light surfaces
    sand: '#F4EEE2', // warm cream — chip / icon tints
    line: '#E7DECB', // warm hairline border
    ink: '#10302F', // body text on light surfaces
    muted: '#5E6E6C', // secondary text
    bg1: '#071F21', // canvas top
    bg2: '#051718', // canvas bottom
    bgImage: '',
  },
};

export const THEME_IDS = Object.keys(PALETTES) as ThemeId[];
export const DEFAULT_THEME: ThemeId = 'luxury';

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
    '--bg-image': p.bgImage ? `url(${p.bgImage})` : 'none',
  };
}
