'use client';

import Button from '@mui/material/Button';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setTab, setScreen, type PlannerTab } from '@/store/slices/uiSlice';
import { selectCartLineCount } from '@/store/selectors/unifiedCartSelectors';
import { GOLD_BUTTON } from '@/components/planner/goldButton';
import Icon from '@/components/ui/Icon';

const TABS: { id: PlannerTab; label: string; icon: string }[] = [
  { id: 'hotels', label: 'Hotels', icon: 'building' },
  { id: 'cabs', label: 'Cabs', icon: 'car' },
  { id: 'celebrations', label: 'Celebrations & Experiences', icon: 'confetti' },
  { id: 'gifts', label: 'Surprise Gifts', icon: 'gift' },
  { id: 'onground', label: 'On-ground Services', icon: 'camera' },
  { id: 'itinerary', label: 'Itinerary', icon: 'route' },
];

/**
 * Product tabs — every tab is always available; customers shop one alone or
 * combine several, and everything meets in the shared cart. Scrolls
 * horizontally on phones. "Review order" appears once the cart has lines.
 */
export default function TabBar() {
  const dispatch = useAppDispatch();
  const active = useAppSelector((s) => s.ui.tab);
  const cartCount = useAppSelector(selectCartLineCount);

  return (
    <div className="flex items-center gap-3 border-b border-white/15">
      <div
        className="flex min-w-0 flex-1 gap-1 overflow-x-auto"
        style={{ scrollbarWidth: 'none' }}
        role="tablist"
        aria-label="Shop by category"
      >
        {TABS.map((t) => {
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => dispatch(setTab(t.id))}
              className="flex cursor-pointer items-center gap-1.5 border-none bg-transparent px-3 py-3 text-[13px] font-bold whitespace-nowrap transition-colors"
              style={{
                color: isActive ? 'var(--accent)' : 'rgba(255,255,255,.6)',
                boxShadow: isActive ? 'inset 0 -2.5px 0 var(--accent)' : 'none',
              }}
            >
              <Icon name={t.icon} size={17} />
              {t.label}
            </button>
          );
        })}
      </div>

      {cartCount > 0 && (
        <Button
          variant="contained"
          size="small"
          onClick={() => dispatch(setScreen('review'))}
          endIcon={<Icon name="arrow-right" size={16} />}
          sx={{ ...GOLD_BUTTON, flexShrink: 0, whiteSpace: 'nowrap' }}
        >
          Review order
        </Button>
      )}
    </div>
  );
}
