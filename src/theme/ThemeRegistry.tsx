'use client';

import { useMemo, type ReactNode } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import { useAppSelector } from '@/store/hooks';
import { PALETTES, paletteToCssVars } from './palettes';
import { buildMuiTheme } from './muiTheme';

/**
 * Bridges the active Redux theme into both worlds:
 *  - MUI components, via a freshly built theme.
 *  - Tailwind / inline styles, via CSS custom properties on a wrapper div.
 * Switching the palette in the store re-themes the entire app at runtime.
 */
function ThemedShell({ children }: { children: ReactNode }) {
  const themeId = useAppSelector((s) => s.ui.themeId);
  const palette = PALETTES[themeId];
  const theme = useMemo(() => buildMuiTheme(palette), [palette]);
  const cssVars = useMemo(() => paletteToCssVars(palette), [palette]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <div style={cssVars as React.CSSProperties} className="et-theme-root">
        {children}
      </div>
    </ThemeProvider>
  );
}

export default function ThemeRegistry({ children }: { children: ReactNode }) {
  return (
    <AppRouterCacheProvider options={{ key: 'mui', enableCssLayer: true }}>
      <ThemedShell>{children}</ThemedShell>
    </AppRouterCacheProvider>
  );
}
