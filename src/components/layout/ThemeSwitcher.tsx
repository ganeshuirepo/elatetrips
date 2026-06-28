'use client';

import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setTheme } from '@/store/slices/uiSlice';
import { PALETTES, THEME_IDS } from '@/theme/palettes';

/** Five palette swatches that re-theme the whole app on click. */
export default function ThemeSwitcher() {
  const dispatch = useAppDispatch();
  const active = useAppSelector((s) => s.ui.themeId);

  return (
    <div className="border-line flex items-center gap-[9px] border-l pl-4">
      <span className="text-muted text-[10.5px] font-black tracking-[0.05em] uppercase">Theme</span>
      <div className="flex items-center gap-[7px]">
        {THEME_IDS.map((id) => {
          const p = PALETTES[id];
          const isActive = id === active;
          return (
            <button
              key={id}
              type="button"
              title={p.label}
              aria-label={p.label}
              aria-pressed={isActive}
              onClick={() => dispatch(setTheme(id))}
              className="h-[22px] w-[22px] cursor-pointer rounded-full p-0"
              style={{
                background: `linear-gradient(135deg, ${p.primary} 0 50%, ${p.accent} 50% 100%)`,
                border: isActive ? '2px solid #fff' : '2px solid #fff',
                boxShadow: isActive ? `0 0 0 2px ${p.primary}` : '0 0 0 1px rgba(0,0,0,.12)',
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
