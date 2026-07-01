import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

/**
 * "Celebration services" step — the answers users give about the kind of
 * celebration they want, between Plan and Hotels. Scalar answers live as named
 * fields; every multi-select category (decor, food, music, …) lives under
 * `picks[categoryId]` so new categories need no schema change.
 */
export type ServiceScalarKey =
  | 'date'
  | 'time'
  | 'age'
  | 'ageGroup'
  | 'gender'
  | 'milestoneFor'
  | 'venue'
  | 'notes';

export interface ServicesState {
  date: string;
  time: string;
  guests: number;
  age: string;
  ageGroup: string;
  gender: string;
  milestoneFor: string;
  venue: string;
  notes: string;
  /** category id → selected option ids. */
  picks: Record<string, string[]>;
}

const initialState: ServicesState = {
  date: '',
  time: '',
  guests: 2,
  age: '',
  ageGroup: '',
  gender: 'any',
  milestoneFor: '',
  venue: '',
  notes: '',
  picks: {},
};

const servicesSlice = createSlice({
  name: 'services',
  initialState,
  reducers: {
    setSvcField(state, action: PayloadAction<{ key: ServiceScalarKey; value: string }>) {
      state[action.payload.key] = action.payload.value;
    },
    setSvcGuests(state, action: PayloadAction<number>) {
      state.guests = Math.max(1, action.payload || 1);
    },
    /** Toggle one option within a category (multi-select). */
    toggleSvcPick(state, action: PayloadAction<{ cat: string; id: string }>) {
      const { cat, id } = action.payload;
      const arr = state.picks[cat] ?? [];
      state.picks[cat] = arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];
    },
  },
});

export const { setSvcField, setSvcGuests, toggleSvcPick } = servicesSlice.actions;
export default servicesSlice.reducer;
