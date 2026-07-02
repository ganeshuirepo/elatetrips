import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

/**
 * "Celebration services" answers. Basics that vary per occasion — the date
 * (within the tour), the time of day and the headcount — live under
 * `occasions[occasionId]`. Answers that are singular for the trip (age, gender,
 * venue, notes) and every multi-select category live as their own fields.
 */
export type ServiceScalarKey = 'age' | 'ageGroup' | 'gender' | 'milestoneFor' | 'venue' | 'notes';

export interface OccasionBasics {
  /** ISO date, expected to fall within the selected tour range. */
  date: string;
  /** Time of day id (24h "HH:00", see TIME_OPTIONS). */
  time: string;
}

export interface ServicesState {
  age: string;
  ageGroup: string;
  gender: string;
  milestoneFor: string;
  venue: string;
  notes: string;
  /** Per-occasion basics keyed by celebration id. */
  occasions: Record<string, OccasionBasics>;
  /** category id → selected option ids. */
  picks: Record<string, string[]>;
  /**
   * Per-tile day/time, used by escapes where each experience is scheduled on
   * its own. Keyed by `${occasionId}:${categoryId}:${optionId}`.
   */
  schedule: Record<string, OccasionBasics>;
  /** User chose "I'll skip this section" — unlocks Continue with no picks. */
  skipSection: boolean;
}

const initialState: ServicesState = {
  age: '',
  ageGroup: '',
  gender: '',
  milestoneFor: '',
  venue: '',
  notes: '',
  occasions: {},
  picks: {},
  schedule: {},
  skipSection: false,
};

const defaultOccasion = (): OccasionBasics => ({ date: '', time: '' });

const servicesSlice = createSlice({
  name: 'services',
  initialState,
  reducers: {
    setSvcField(state, action: PayloadAction<{ key: ServiceScalarKey; value: string }>) {
      state[action.payload.key] = action.payload.value;
    },
    /** Set an occasion's date or time. */
    setOccasionField(
      state,
      action: PayloadAction<{ id: string; key: 'date' | 'time'; value: string }>,
    ) {
      const { id, key, value } = action.payload;
      const o = state.occasions[id] ?? defaultOccasion();
      state.occasions[id] = { ...o, [key]: value };
    },
    /** Toggle one option within a category (multi-select). */
    toggleSvcPick(state, action: PayloadAction<{ cat: string; id: string }>) {
      const { cat, id } = action.payload;
      const arr = state.picks[cat] ?? [];
      state.picks[cat] = arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];
    },
    setSkipSection(state, action: PayloadAction<boolean>) {
      state.skipSection = action.payload;
    },
    /** Set the day or time for a single tile (escapes schedule per experience). */
    setTileSchedule(
      state,
      action: PayloadAction<{ key: string; field: 'date' | 'time'; value: string }>,
    ) {
      const { key, field, value } = action.payload;
      const s = state.schedule[key] ?? defaultOccasion();
      state.schedule[key] = { ...s, [field]: value };
    },
  },
});

export const { setSvcField, setOccasionField, toggleSvcPick, setTileSchedule, setSkipSection } =
  servicesSlice.actions;
export default servicesSlice.reducer;
