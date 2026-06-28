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
      primary: { main: p.primary, contrastText: '#ffffff' },
      secondary: { main: p.accent, dark: p.accentInk, contrastText: '#ffffff' },
      text: { primary: p.ink, secondary: p.muted },
      divider: p.line,
      background: { default: p.bg1, paper: '#ffffff' },
    },
    shape: { borderRadius: 12 },
    typography: {
      fontFamily: 'var(--font-lato), system-ui, sans-serif',
      h1: { fontFamily: 'var(--font-playfair), Georgia, serif', fontWeight: 700 },
      h2: { fontFamily: 'var(--font-playfair), Georgia, serif', fontWeight: 700 },
      h3: { fontFamily: 'var(--font-playfair), Georgia, serif', fontWeight: 700 },
      button: { textTransform: 'none', fontWeight: 700 },
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
