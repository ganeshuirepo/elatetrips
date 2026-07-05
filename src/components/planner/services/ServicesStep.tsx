'use client';

import Button from '@mui/material/Button';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setStep } from '@/store/slices/uiSlice';
import { toggleSvcPick, toggleSkipPanel } from '@/store/slices/servicesSlice';
import { SURPRISE_GIFTS } from '@/data/services';
import { OccasionTiles } from './PackageTiles';
import { GOLD_BUTTON } from '@/components/planner/goldButton';
import Icon from '@/components/ui/Icon';

/**
 * Local specials — the last stop before Review. A single open grid of
 * surprise-gift tiles (hampers, keepsakes, blooms); pick some or skip the
 * section to continue.
 */
export default function ServicesStep() {
  const dispatch = useAppDispatch();
  const picks = useAppSelector((s) => s.services.picks);
  const skipped = useAppSelector((s) => !!s.services.skippedSections[SURPRISE_GIFTS.id]);

  const picked = (picks[SURPRISE_GIFTS.id] ?? []).length > 0;
  const canContinue = skipped || picked;

  return (
    <div className="flex max-w-[804px] flex-col gap-5">
      {/* Heading + skip */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-accent text-[11px] font-black tracking-[0.06em] uppercase">
            Local specials
          </span>
          <span className="text-[13px] text-white/60">
            Take home a little of Ooty — hampers, keepsakes and blooms delivered to your stay.
          </span>
        </div>
        <button
          type="button"
          onClick={() => dispatch(toggleSkipPanel(SURPRISE_GIFTS.id))}
          className="cursor-pointer rounded-full border-[1.5px] px-3 py-1 text-[11.5px] font-bold transition-colors"
          style={{
            background: skipped ? 'var(--accent)' : 'transparent',
            borderColor: skipped ? 'var(--accent)' : 'rgba(255,255,255,.25)',
            color: skipped ? '#08201F' : 'rgba(255,255,255,.75)',
          }}
        >
          {skipped ? 'Skipped — undo' : "I'll skip this"}
        </button>
      </div>

      {/* Tiles — always visible, no accordion */}
      <div style={{ opacity: skipped ? 0.55 : 1 }}>
        <OccasionTiles
          cats={[SURPRISE_GIFTS]}
          picks={picks}
          onToggle={(cat, oid) => dispatch(toggleSvcPick({ cat, id: oid }))}
        />
      </div>

      {/* Action bar — sticky; Back left, Continue right */}
      <div
        className="sticky bottom-0 z-30 flex flex-col gap-2 border-t border-white/15 py-3 backdrop-blur-md"
        style={{ background: 'color-mix(in srgb, var(--bg2) 82%, transparent)' }}
      >
        <span className="flex items-center gap-2 text-[13px] text-white/65">
          <Icon name="info-circle" size={16} />{' '}
          {canContinue
            ? 'All set — review your celebration plan next.'
            : 'Pick a special — or skip this section to continue.'}
        </span>
        <div className="flex w-full items-center justify-between gap-3">
          <Button
            variant="contained"
            size="large"
            onClick={() => dispatch(setStep('prefs'))}
            startIcon={<Icon name="arrow-left" size={18} />}
            sx={GOLD_BUTTON}
          >
            Back
          </Button>
          <Button
            variant="contained"
            size="large"
            disabled={!canContinue}
            onClick={() => dispatch(setStep('review'))}
            endIcon={<Icon name="arrow-right" size={18} />}
            sx={GOLD_BUTTON}
          >
            Continue to review
          </Button>
        </div>
      </div>
    </div>
  );
}
