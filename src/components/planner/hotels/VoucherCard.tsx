'use client';

import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  toggleVoucher,
  setVoucherDay,
  stepVoucherQty,
  toggleVoucherDetails,
  type MetaKey,
} from '@/store/slices/addonsSlice';
import { selectDays, selectPax } from '@/store/selectors/planSelectors';
import { inr } from '@/domain/format';
import { fmtDay } from '@/domain/format';
import { voucherLineTotal } from '@/domain/pricing';
import Stepper from '@/components/ui/Stepper';
import Icon from '@/components/ui/Icon';
import ExpandableRow from '@/components/ui/ExpandableRow';
import type { Voucher } from '@/domain/types';

/** Dated voucher rendered as an expandable row (day picker + pax-capped qty). */
export default function VoucherCard({ metaKey, voucher }: { metaKey: MetaKey; voucher: Voucher }) {
  const dispatch = useAppDispatch();
  const days = useAppSelector(selectDays);
  const pax = useAppSelector(selectPax);
  const meta = useAppSelector((s) => s.addons[metaKey][voucher.id]);
  const open = useAppSelector((s) => s.addons.voucherOpen[`${metaKey}|${voucher.id}`]);
  const selected = !!meta;
  const qty = meta ? Math.min(meta.qty, Math.max(1, pax)) : 1;

  return (
    <ExpandableRow
      open={!!open}
      onToggle={() => dispatch(toggleVoucherDetails({ metaKey, id: voucher.id }))}
      icon={voucher.icon}
      title={voucher.name}
      subtitle={
        <span className="flex items-center gap-1.5">
          <span className="bg-sand text-accent-ink rounded px-1.5 py-[1px] text-[10px] font-bold">
            {voucher.category}
          </span>
          {voucher.sub}
        </span>
      }
      active={selected}
      right={
        <span className="text-accent-ink text-[13px] font-extrabold">
          {inr(voucher.price)}
          <span className="text-muted text-[10px] font-semibold">/person</span>
        </span>
      }
    >
      <div className="flex flex-col gap-3">
        <ul className="text-muted flex flex-col gap-1 text-[12px]">
          {voucher.inc.map((inc) => (
            <li key={inc} className="flex items-center gap-1.5">
              <Icon name="check" size={13} style={{ color: 'var(--accent)' }} /> {inc}
            </li>
          ))}
        </ul>

        {selected && (
          <div className="bg-sand/50 flex flex-wrap items-center justify-between gap-2 rounded-[10px] p-2">
            <select
              value={meta!.day}
              onChange={(e) => dispatch(setVoucherDay({ metaKey, id: voucher.id, day: e.target.value }))}
              aria-label={`${voucher.name} day`}
              className="border-line rounded-[8px] border bg-white px-2 py-1.5 text-[12.5px] font-semibold outline-none"
            >
              {days.map((d) => (
                <option key={d} value={d}>
                  {fmtDay(d)}
                </option>
              ))}
            </select>
            <Stepper
              ariaLabel={`${voucher.name} headcount`}
              value={qty}
              min={1}
              max={Math.max(1, pax)}
              onDec={() => dispatch(stepVoucherQty({ metaKey, id: voucher.id, delta: -1, maxPax: pax }))}
              onInc={() => dispatch(stepVoucherQty({ metaKey, id: voucher.id, delta: 1, maxPax: pax }))}
            />
            <span className="text-ink text-[13px] font-extrabold">
              {inr(voucherLineTotal(voucher.price, qty, pax))}
            </span>
          </div>
        )}

        <button
          type="button"
          aria-pressed={selected}
          onClick={() => dispatch(toggleVoucher({ metaKey, id: voucher.id, firstDay: days[0] || '' }))}
          className="w-fit rounded-full border-[1.5px] px-4 py-1.5 text-[12px] font-bold"
          style={{
            borderColor: selected ? 'var(--accent)' : 'var(--line)',
            background: selected ? 'var(--accent)' : '#fff',
            color: selected ? '#fff' : 'var(--ink)',
          }}
        >
          {selected ? 'Added ✓' : 'Add to plan'}
        </button>
      </div>
    </ExpandableRow>
  );
}
