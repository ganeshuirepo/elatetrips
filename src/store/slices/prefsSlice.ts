import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { TimelineItem } from '@/domain/timeline';

/**
 * Preferences step state: what the traveller cares about (place interests +
 * celebration-service types) and the day-by-day trip timeline they curate —
 * places, celebration services and adventures placed on specific days/times.
 */
export interface PrefsState {
  /** Place-interest tag ids (gardens, viewpoints, wildlife…). */
  interests: string[];
  /** Service-type ids the user wants for the celebration (decor, music…). */
  servicePrefs: string[];
  /** User-curated day/time plan. */
  timeline: TimelineItem[];
}

const initialState: PrefsState = {
  interests: [],
  servicePrefs: [],
  timeline: [],
};

const toggle = (list: string[], id: string) =>
  list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

const prefsSlice = createSlice({
  name: 'prefs',
  initialState,
  reducers: {
    toggleInterest(state, action: PayloadAction<string>) {
      state.interests = toggle(state.interests, action.payload);
    },
    toggleServicePref(state, action: PayloadAction<string>) {
      state.servicePrefs = toggle(state.servicePrefs, action.payload);
    },
    addTimelineItem(state, action: PayloadAction<TimelineItem>) {
      // Replace rather than duplicate if the exact same slot exists.
      state.timeline = [
        ...state.timeline.filter((i) => i.id !== action.payload.id),
        action.payload,
      ];
    },
    removeTimelineItem(state, action: PayloadAction<string>) {
      state.timeline = state.timeline.filter((i) => i.id !== action.payload);
    },
    /** Wholesale replace — used by the AI auto-planner. */
    setTimeline(state, action: PayloadAction<TimelineItem[]>) {
      state.timeline = action.payload;
    },
    clearTimeline(state) {
      state.timeline = [];
    },
  },
});

export const {
  toggleInterest,
  toggleServicePref,
  addTimelineItem,
  removeTimelineItem,
  setTimeline,
  clearTimeline,
} = prefsSlice.actions;
export default prefsSlice.reducer;
