import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { TRAVELLERS_MAX, ROOMS_MAX, MAX_CELEBRATIONS_DEFAULT } from '@/data/constants';
import { celebComboValid } from '@/domain/rules';

/** Step 1 trip basics: where, when, who, and which celebrations. */
export interface PlanState {
  /** Selected destination ids (single-select in practice). */
  dest: string[];
  destQuery: string;
  start: string;
  end: string;
  adults: number;
  children: number;
  rooms: number;
  celebs: string[];
  celebDays: Record<string, string>;
  celebAge: Record<string, string>;
  /** Calendar's currently displayed month (first-of-month ISO). */
  viewMonth: string;
  maxCelebrations: number;
}

const initialState: PlanState = {
  dest: [],
  destQuery: '',
  start: '',
  end: '',
  adults: 2,
  children: 0,
  rooms: 1,
  celebs: [],
  celebDays: {},
  celebAge: {},
  viewMonth: '',
  maxCelebrations: MAX_CELEBRATIONS_DEFAULT,
};

const planSlice = createSlice({
  name: 'plan',
  initialState,
  reducers: {
    selectDest(state, action: PayloadAction<{ id: string; name: string }>) {
      state.dest = [action.payload.id];
      state.destQuery = action.payload.name;
    },
    setDestQuery(state, action: PayloadAction<string>) {
      state.destQuery = action.payload;
      state.dest = [];
    },
    clearDest(state) {
      state.dest = [];
      state.destQuery = '';
    },
    setViewMonth(state, action: PayloadAction<string>) {
      state.viewMonth = action.payload;
    },
    /** Range picker: first click sets start, second sets end, third restarts. */
    pickDay(state, action: PayloadAction<string>) {
      const iso = action.payload;
      if (!state.start || (state.start && state.end)) {
        state.start = iso;
        state.end = '';
      } else if (iso < state.start) {
        state.start = iso;
        state.end = '';
      } else {
        state.end = iso;
      }
    },
    clearDates(state) {
      state.start = '';
      state.end = '';
    },
    stepTravellers(state, action: PayloadAction<{ key: 'adults' | 'children'; delta: number }>) {
      const { key, delta } = action.payload;
      const min = key === 'adults' ? 1 : 0;
      state[key] = Math.max(min, Math.min(TRAVELLERS_MAX, state[key] + delta));
    },
    stepRooms(state, action: PayloadAction<number>) {
      state.rooms = Math.max(1, Math.min(ROOMS_MAX, state.rooms + action.payload));
    },
    /** Set traveller counts directly (used by the voice assistant). */
    setTravellers(state, action: PayloadAction<{ adults?: number; children?: number }>) {
      if (action.payload.adults != null)
        state.adults = Math.max(1, Math.min(TRAVELLERS_MAX, action.payload.adults));
      if (action.payload.children != null)
        state.children = Math.max(0, Math.min(TRAVELLERS_MAX, action.payload.children));
    },
    /** Set room count directly (used by the voice assistant). */
    setRooms(state, action: PayloadAction<number>) {
      state.rooms = Math.max(1, Math.min(ROOMS_MAX, action.payload));
    },
    toggleCeleb(state, action: PayloadAction<string>) {
      const id = action.payload;
      if (state.celebs.includes(id)) {
        state.celebs = state.celebs.filter((x) => x !== id);
        delete state.celebDays[id];
        delete state.celebAge[id];
        return;
      }
      if (state.celebs.length >= state.maxCelebrations) return;
      if (!celebComboValid([...state.celebs, id])) return;
      state.celebs.push(id);
    },
    setCelebDay(state, action: PayloadAction<{ id: string; day: string }>) {
      state.celebDays[action.payload.id] = action.payload.day;
    },
    setCelebAge(state, action: PayloadAction<{ id: string; age: string }>) {
      state.celebAge[action.payload.id] = action.payload.age.replace(/[^0-9]/g, '').slice(0, 3);
    },
  },
});

export const {
  selectDest,
  setDestQuery,
  clearDest,
  setViewMonth,
  pickDay,
  clearDates,
  stepTravellers,
  stepRooms,
  setTravellers,
  setRooms,
  toggleCeleb,
  setCelebDay,
  setCelebAge,
} = planSlice.actions;
export default planSlice.reducer;
