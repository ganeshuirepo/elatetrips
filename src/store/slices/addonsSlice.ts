import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { W_BUDGET_MIN, W_BUDGET_MAX } from '@/data/wedding';
import type { VoucherMeta } from '@/domain/types';

/** Which voucher meta map a toggle targets. */
export type MetaKey = 'advMeta' | 'expMeta';

/** Celebration packages, activity/experience vouchers, and the wedding form. */
export interface AddonsState {
  /** Selected package names per celebration id. */
  pkgs: Record<string, string[]>;
  /** Expanded "what's included" panels, keyed `${cid}|${name}`. */
  pkgOpen: Record<string, boolean>;
  advMeta: Record<string, VoucherMeta>;
  expMeta: Record<string, VoucherMeta>;
  /** Expanded voucher detail panels, keyed `${metaKey}|${id}`. */
  voucherOpen: Record<string, boolean>;
  wGuests: string;
  wCouple: string;
  wBudget: number;
  wCeremonies: string[];
}

const initialState: AddonsState = {
  pkgs: {},
  pkgOpen: {},
  advMeta: {},
  expMeta: {},
  voucherOpen: {},
  wGuests: '',
  wCouple: '',
  wBudget: 200000,
  wCeremonies: [],
};

const addonsSlice = createSlice({
  name: 'addons',
  initialState,
  reducers: {
    togglePkg(state, action: PayloadAction<{ cid: string; name: string }>) {
      const { cid, name } = action.payload;
      const cur = state.pkgs[cid] || [];
      state.pkgs[cid] = cur.includes(name) ? cur.filter((x) => x !== name) : [...cur, name];
    },
    togglePkgDetails(state, action: PayloadAction<{ cid: string; name: string }>) {
      const key = `${action.payload.cid}|${action.payload.name}`;
      state.pkgOpen[key] = !state.pkgOpen[key];
    },
    /** Select/deselect a voucher; on first select seed day + qty. */
    toggleVoucher(
      state,
      action: PayloadAction<{ metaKey: MetaKey; id: string; firstDay: string }>,
    ) {
      const { metaKey, id, firstDay } = action.payload;
      const map = state[metaKey];
      if (map[id]) delete map[id];
      else map[id] = { day: firstDay, qty: 1 };
    },
    setVoucherDay(state, action: PayloadAction<{ metaKey: MetaKey; id: string; day: string }>) {
      const { metaKey, id, day } = action.payload;
      const cur = state[metaKey][id];
      if (cur) cur.day = day;
    },
    stepVoucherQty(
      state,
      action: PayloadAction<{ metaKey: MetaKey; id: string; delta: number; maxPax: number }>,
    ) {
      const { metaKey, id, delta, maxPax } = action.payload;
      const cur = state[metaKey][id];
      if (!cur) return;
      cur.qty = Math.max(1, Math.min(Math.max(1, maxPax), cur.qty + delta));
    },
    toggleVoucherDetails(state, action: PayloadAction<{ metaKey: MetaKey; id: string }>) {
      const key = `${action.payload.metaKey}|${action.payload.id}`;
      state.voucherOpen[key] = !state.voucherOpen[key];
    },
    setWGuests(state, action: PayloadAction<string>) {
      state.wGuests = action.payload.replace(/[^0-9]/g, '').slice(0, 5);
    },
    setWCouple(state, action: PayloadAction<string>) {
      state.wCouple = action.payload;
    },
    setWBudget(state, action: PayloadAction<number>) {
      state.wBudget = Math.max(
        W_BUDGET_MIN,
        Math.min(W_BUDGET_MAX, action.payload || W_BUDGET_MIN),
      );
    },
    toggleCeremony(state, action: PayloadAction<string>) {
      const name = action.payload;
      state.wCeremonies = state.wCeremonies.includes(name)
        ? state.wCeremonies.filter((x) => x !== name)
        : [...state.wCeremonies, name];
    },
  },
});

export const {
  togglePkg,
  togglePkgDetails,
  toggleVoucher,
  setVoucherDay,
  stepVoucherQty,
  toggleVoucherDetails,
  setWGuests,
  setWCouple,
  setWBudget,
  toggleCeremony,
} = addonsSlice.actions;
export default addonsSlice.reducer;
