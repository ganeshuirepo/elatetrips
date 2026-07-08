'use client';

import { useState } from 'react';
import Button from '@mui/material/Button';
import { useAppSelector } from '@/store/hooks';
import { selectPage1Ready } from '@/store/selectors/planSelectors';
import CelebrationGrid from '@/components/planner/plan/CelebrationGrid';
import InterestPopup from '@/components/planner/plan/InterestPopup';
import CelebrationServices from './CelebrationServices';
import ActivitiesExperiences from './ActivitiesExperiences';
import Card from '@/components/ui/Card';
import { GOLD_BUTTON } from '@/components/planner/goldButton';
import Icon from '@/components/ui/Icon';

/**
 * Celebrations & Experiences tab — pick occasions, tailor each one (day,
 * time, interests via the combined popup; saved occasions also land on the
 * Itinerary timeline), add celebration services and adventure/experience
 * add-ons. Everything is optional and independently orderable.
 */
export default function CelebrationsTab() {
  const celebs = useAppSelector((s) => s.plan.celebs);
  const datesReady = useAppSelector(selectPage1Ready);
  const [popupOpen, setPopupOpen] = useState(false);

  const canTailor = celebs.length > 0 && datesReady;

  return (
    <div className="flex flex-col gap-6">
      {/* Occasion picker */}
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-accent text-[11px] font-black tracking-[0.06em] uppercase">
            What are we celebrating?
          </span>
          <span className="text-[12.5px] text-white/55">
            Pick one or more occasions — we&apos;ll tailor services and stays to suit.
          </span>
        </div>
        <CelebrationGrid />

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <span className="flex items-center gap-2 text-[13px] text-white/65">
            <Icon name="info-circle" size={16} />{' '}
            {celebs.length === 0
              ? 'Pick an occasion to tailor it with a day, time and interests.'
              : !datesReady
                ? 'Add your destination & dates above to schedule your occasions.'
                : 'Set a day, time and the touches you’d like for each occasion.'}
          </span>
          <Button
            variant="contained"
            disabled={!canTailor}
            onClick={() => setPopupOpen(true)}
            startIcon={<Icon name="adjustments-horizontal" size={18} />}
            sx={GOLD_BUTTON}
          >
            Tailor your occasions
          </Button>
        </div>
      </div>

      {/* Per-occasion service tiles (white card surface) */}
      {celebs.length > 0 && (
        <Card>
          <CelebrationServices />
        </Card>
      )}

      {/* Adventure & local-experience add-ons — occasion-independent */}
      <Card className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-ink text-[14px] font-extrabold">Adventures &amp; experiences</span>
          <span className="text-muted text-[12.5px]">
            Per-person vouchers — add any, with or without a celebration.
          </span>
        </div>
        <ActivitiesExperiences />
      </Card>

      {popupOpen && (
        <InterestPopup onClose={() => setPopupOpen(false)} onSave={() => setPopupOpen(false)} />
      )}
    </div>
  );
}
