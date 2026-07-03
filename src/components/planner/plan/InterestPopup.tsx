'use client';

import { useState } from 'react';
import Button from '@mui/material/Button';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setOccasionInterests } from '@/store/slices/prefsSlice';
import { interestsFor } from '@/data/occasionInterests';
import Icon from '@/components/ui/Icon';
import type { Celebration } from '@/domain/types';

/**
 * Opens when a celebration/escape tile is picked on the Plan step: the
 * occasion's configurable interest filters as multi-select chips, saved to
 * the store via "Save interests".
 */
export default function InterestPopup({
  celeb,
  onClose,
}: {
  celeb: Celebration;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const saved = useAppSelector((s) => s.prefs.occasionInterests[celeb.id] ?? []);
  const [chosen, setChosen] = useState<string[]>(saved);
  const options = interestsFor(celeb.id);

  const toggle = (id: string) =>
    setChosen((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));

  const save = () => {
    dispatch(setOccasionInterests({ id: celeb.id, interests: chosen }));
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${celeb.name} interests`}
        className="flex max-h-[85vh] w-full max-w-[460px] flex-col overflow-hidden rounded-[18px] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-5 pb-0">
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-10 w-10 items-center justify-center rounded-full text-[22px]"
              style={{ background: 'var(--accent)', color: '#08201F' }}
            >
              <Icon name={celeb.icon} />
            </span>
            <div className="flex flex-col">
              <h2 className="text-ink m-0 font-serif text-[20px] font-bold">{celeb.name}</h2>
              <span className="text-ink/55 text-[12.5px]">
                Pick what you&apos;d like — we&apos;ll tailor suggestions to suit.
              </span>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="text-ink/50 hover:text-ink flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors"
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-5">
          {options.length === 0 ? (
            <span className="text-ink/55 text-[13px]">
              No filters configured for this occasion yet.
            </span>
          ) : (
            <div className="flex flex-wrap gap-2">
              {options.map((o) => {
                const active = chosen.includes(o.id);
                return (
                  <button
                    key={o.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggle(o.id)}
                    className="flex cursor-pointer items-center gap-2 rounded-full border-[1.5px] px-3.5 py-2 text-[13px] font-semibold transition-colors"
                    style={{
                      background: active ? 'var(--accent)' : '#FAF7F2',
                      borderColor: active ? 'var(--accent)' : '#EBE1CF',
                      color: active ? '#08201F' : 'var(--ink)',
                    }}
                  >
                    <Icon name={o.icon} size={16} />
                    {o.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[#EBE1CF] p-4">
          <span className="text-ink/55 text-[12.5px]">
            {chosen.length > 0 ? `${chosen.length} selected` : 'All optional'}
          </span>
          <Button
            variant="contained"
            onClick={save}
            startIcon={<Icon name="check" size={16} />}
            sx={{
              background: 'linear-gradient(180deg,#e9c97f,#d4a94f)',
              color: '#08201f',
              fontWeight: 800,
              boxShadow: 'none',
              '&:hover': {
                background: 'linear-gradient(180deg,#edd089,#d9af55)',
                boxShadow: 'none',
              },
            }}
          >
            Save interests
          </Button>
        </div>
      </div>
    </div>
  );
}
