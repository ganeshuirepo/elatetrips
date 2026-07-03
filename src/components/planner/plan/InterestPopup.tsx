'use client';

import { useState } from 'react';
import Button from '@mui/material/Button';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setOccasionInterests } from '@/store/slices/prefsSlice';
import { setOccasionField } from '@/store/slices/servicesSlice';
import { selectDays } from '@/store/selectors/planSelectors';
import { interestsFor } from '@/data/occasionInterests';
import { CELEBRATIONS } from '@/data/celebrations';
import { TIME_OPTIONS } from '@/data/services';
import { fmtBig, fmtSub } from '@/domain/format';
import Icon from '@/components/ui/Icon';

interface Draft {
  interests: string[];
  date: string;
  time: string;
}

/**
 * Opens from the Plan step's Continue: one section per selected occasion
 * (celebrations and escapes) with its day, time and configurable interest
 * filters. "Save interests" stores everything and moves the wizard on.
 */
export default function InterestPopup({
  onClose,
  onSave,
}: {
  onClose: () => void;
  /** Called after saving — the Plan step continues to Preferences. */
  onSave: () => void;
}) {
  const dispatch = useAppDispatch();
  const celebs = useAppSelector((s) => s.plan.celebs);
  const savedInterests = useAppSelector((s) => s.prefs.occasionInterests);
  const occasions = useAppSelector((s) => s.services.occasions);
  const tourDays = useAppSelector(selectDays);

  const chosen = CELEBRATIONS.filter((c) => celebs.includes(c.id));

  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(
      chosen.map((c) => [
        c.id,
        {
          interests: savedInterests[c.id] ?? [],
          date: occasions[c.id]?.date ?? '',
          time: occasions[c.id]?.time ?? '',
        },
      ]),
    ),
  );

  const patch = (id: string, part: Partial<Draft>) =>
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...part } }));

  const toggleChip = (id: string, opt: string) =>
    setDrafts((d) => {
      const list = d[id].interests;
      return {
        ...d,
        [id]: {
          ...d[id],
          interests: list.includes(opt) ? list.filter((x) => x !== opt) : [...list, opt],
        },
      };
    });

  const totalPicked = Object.values(drafts).reduce((n, d) => n + d.interests.length, 0);

  const save = () => {
    for (const c of chosen) {
      const d = drafts[c.id];
      dispatch(setOccasionInterests({ id: c.id, interests: d.interests }));
      if (!c.noSchedule) {
        dispatch(setOccasionField({ id: c.id, key: 'date', value: d.date }));
        dispatch(setOccasionField({ id: c.id, key: 'time', value: d.time }));
      }
    }
    onSave();
  };

  const selectClass =
    'text-ink min-w-0 flex-1 rounded-[12px] border border-[#DAD6CC] bg-white px-3 py-2.5 text-[13.5px] font-semibold outline-none';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Occasion interests"
        className="flex max-h-[88vh] w-full max-w-[560px] flex-col overflow-hidden rounded-[18px] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#EBE1CF] p-5">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-ink m-0 font-serif text-[20px] font-bold">Tailor your occasions</h2>
            <span className="text-ink/55 text-[12.5px]">
              Pick a day, time and the touches you&apos;d like for each — all optional.
            </span>
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

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {chosen.map((c, i) => {
            const d = drafts[c.id];
            const options = interestsFor(c.id);
            return (
              <div
                key={c.id}
                className="flex flex-col gap-3 p-5"
                style={i > 0 ? { borderTop: '1px solid #EBE1CF' } : undefined}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-full text-[19px]"
                    style={{ background: 'var(--accent)', color: '#08201F' }}
                  >
                    <Icon name={c.icon} />
                  </span>
                  <span className="text-ink font-serif text-[17px] font-bold">{c.name}</span>
                </div>

                {/* Day & time — skipped for trip-long occasions like Honeymoon */}
                {!c.noSchedule && (
                <div className="flex flex-wrap gap-2.5">
                  <label className="flex min-w-[180px] flex-1 flex-col gap-1.5">
                    <span className="text-ink/55 text-[10.5px] font-black tracking-[0.05em] uppercase">
                      Day
                    </span>
                    <select
                      value={d.date}
                      onChange={(e) => patch(c.id, { date: e.target.value })}
                      className={selectClass}
                    >
                      <option value="">Select a tour day</option>
                      {tourDays.map((iso) => (
                        <option key={iso} value={iso}>
                          {fmtBig(iso)} · {fmtSub(iso)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex min-w-[140px] flex-1 flex-col gap-1.5">
                    <span className="text-ink/55 text-[10.5px] font-black tracking-[0.05em] uppercase">
                      Time
                    </span>
                    <select
                      value={d.time}
                      onChange={(e) => patch(c.id, { time: e.target.value })}
                      className={selectClass}
                    >
                      <option value="">Select a time</option>
                      {TIME_OPTIONS.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                )}

                {/* Configurable interest filters */}
                {options.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {options.map((o) => {
                      const active = d.interests.includes(o.id);
                      return (
                        <button
                          key={o.id}
                          type="button"
                          aria-pressed={active}
                          onClick={() => toggleChip(c.id, o.id)}
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
            );
          })}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[#EBE1CF] p-4">
          <span className="text-ink/55 text-[12.5px]">
            {totalPicked > 0 ? `${totalPicked} selected` : 'All optional'}
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
