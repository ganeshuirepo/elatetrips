'use client';

import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { togglePkg, togglePkgDetails } from '@/store/slices/addonsSlice';
import { selectCelebPackageGroups } from '@/store/selectors/addonsSelectors';
import { CELEBRATIONS } from '@/data/celebrations';
import { PKG_PRICE, PKG_ICON, PKG_DESC, PKG_INCLUDES, pkgCategory } from '@/data/packages';
import { inr, fmtDay } from '@/domain/format';
import Icon from '@/components/ui/Icon';
import ExpandableRow from '@/components/ui/ExpandableRow';

/**
 * Celebration packages as expandable rows, grouped per celebration. The left
 * filters narrow which celebrations and which package categories are shown.
 */
export default function CelebrationPackages({
  celebFilter = [],
  categoryFilter = [],
}: {
  celebFilter?: string[];
  categoryFilter?: string[];
}) {
  const dispatch = useAppDispatch();
  const allGroups = useAppSelector(selectCelebPackageGroups);
  const { pkgs, pkgOpen } = useAppSelector((s) => s.addons);
  const celebDays = useAppSelector((s) => s.plan.celebDays);

  if (allGroups.length === 0) {
    return (
      <p className="text-muted text-[13px]">Select a celebration on the Plan step to see packages.</p>
    );
  }

  const inCategory = (name: string) =>
    categoryFilter.length === 0 || categoryFilter.includes(pkgCategory(name));

  const groups = (celebFilter.length
    ? allGroups.filter((g) => celebFilter.includes(g.celebId))
    : allGroups
  )
    .map((g) => ({ ...g, names: g.names.filter(inCategory) }))
    .filter((g) => g.names.length > 0);

  if (groups.length === 0) {
    return <p className="text-muted text-[13px]">No packages match the selected filters.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map(({ celebId, names }) => {
        const celeb = CELEBRATIONS.find((c) => c.id === celebId)!;
        const day = celebDays[celebId];
        const selected = pkgs[celebId] || [];
        return (
          <div key={celebId} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-ink flex items-center gap-2 text-[13px] font-extrabold">
                <Icon name={celeb.icon} size={16} style={{ color: 'var(--accent-ink)' }} />
                {celeb.name}
              </span>
              {day && <span className="text-muted text-[12px] font-semibold">{fmtDay(day)}</span>}
            </div>

            {names.map((name) => {
              const on = selected.includes(name);
              return (
                <ExpandableRow
                  key={name}
                  open={!!pkgOpen[`${celebId}|${name}`]}
                  onToggle={() => dispatch(togglePkgDetails({ cid: celebId, name }))}
                  icon={PKG_ICON[name] || 'ti-gift'}
                  title={name}
                  subtitle={
                    <span className="flex items-center gap-1.5">
                      <span className="bg-sand text-accent-ink rounded px-1.5 py-[1px] text-[10px] font-bold">
                        {pkgCategory(name)}
                      </span>
                      {PKG_DESC[name]}
                    </span>
                  }
                  active={on}
                  right={
                    <span className="text-accent-ink text-[13px] font-extrabold">
                      {inr(PKG_PRICE[name] || 0)}
                    </span>
                  }
                >
                  <div className="flex flex-col gap-3">
                    {PKG_INCLUDES[name] && (
                      <ul className="text-muted flex flex-col gap-1 text-[12px]">
                        {PKG_INCLUDES[name].map((inc) => (
                          <li key={inc} className="flex items-center gap-1.5">
                            <Icon name="check" size={13} style={{ color: 'var(--accent)' }} /> {inc}
                          </li>
                        ))}
                      </ul>
                    )}
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => dispatch(togglePkg({ cid: celebId, name }))}
                      className="w-fit rounded-full border-[1.5px] px-4 py-1.5 text-[12px] font-bold"
                      style={{
                        borderColor: on ? 'var(--accent)' : 'var(--line)',
                        background: on ? 'var(--accent)' : '#fff',
                        color: on ? '#fff' : 'var(--ink)',
                      }}
                    >
                      {on ? 'Added ✓' : 'Add to plan'}
                    </button>
                  </div>
                </ExpandableRow>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
