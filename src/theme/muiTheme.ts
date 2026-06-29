import { createTheme, type Theme } from '@mui/material/styles';
import type { Palette } from './palettes';

/**
 * Build a MUI theme from a celebration palette. MUI owns interactive components
 * (buttons, inputs, sliders, dialogs); Tailwind owns layout. Colours are shared
 * via the same palette object that drives the CSS variables, so the two systems
 * never drift.
 */
export function buildMuiTheme(p: Palette): Theme {
  return createTheme({
    cssVariables: true,
    palette: {
      // Gold is the primary interactive colour (CTAs), on near-black text.
      primary: { main: p.accent, dark: p.accentInk, contrastText: '#08201F' },
      secondary: { main: p.primary, contrastText: '#ffffff' },
      text: { primary: p.ink, secondary: p.muted },
      divider: p.line,
      background: { default: p.bg1, paper: '#FAF7F2' },
    },
    shape: { borderRadius: 12 },
    typography: {
      fontFamily: 'var(--font-sans-lux), system-ui, sans-serif',
      h1: { fontFamily: 'var(--font-serif-lux), Georgia, serif', fontWeight: 600 },
      h2: { fontFamily: 'var(--font-serif-lux), Georgia, serif', fontWeight: 600 },
      h3: { fontFamily: 'var(--font-serif-lux), Georgia, serif', fontWeight: 600 },
      button: { textTransform: 'none', fontWeight: 600 },
    },
    components: {
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: { root: { borderRadius: 12 } },
      },
      MuiTextField: { defaultProps: { size: 'small' } },
    },
  });
}
