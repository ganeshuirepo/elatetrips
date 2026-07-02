/** Gold-gradient CTA style shared by the dark-canvas step action bars. */
export const GOLD_BUTTON = {
  background: 'linear-gradient(180deg,#e9c97f,#d4a94f)',
  color: '#08201f',
  fontWeight: 800,
  boxShadow: 'none',
  '&:hover': { background: 'linear-gradient(180deg,#edd089,#d9af55)', boxShadow: 'none' },
  '&.Mui-disabled': { background: 'rgba(255,255,255,.12)', color: 'rgba(255,255,255,.4)' },
} as const;
