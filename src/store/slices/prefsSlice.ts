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
  /**
   * Interests saved per occasion from the tile popup on the Plan step
   * (keyed by celebration/escape id → chosen option ids).
   */
  occasionInterests: Record<string, string[]>;
  /** User-curated day/time plan. */
  timeline: TimelineItem[];
}

const initialState: PrefsState = {
  interests: [],
  servicePrefs: [],
  occasionInterests: {},
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
    /** "Save interests" in the occasion popup — replaces that occasion's set. */
    setOccasionInterests(state, action: PayloadAction<{ id: string; interests: string[] }>) {
      state.occasionInterests[action.payload.id] = action.payload.interests;
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
    /** Drag & drop: relocate an item to another day (time already resolved). */
    moveTimelineItem(state, action: PayloadAction<{ id: string; day: string; startMin: number }>) {
      const it = state.timeline.find((i) => i.id === action.payload.id);
      if (it) {
        it.day = action.payload.day;
        it.startMin = action.payload.startMin;
      }
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
  setOccasionInterests,
  addTimelineItem,
  removeTimelineItem,
  moveTimelineItem,
  setTimeline,
  clearTimeline,
} = prefsSlice.actions;
export default prefsSlice.reducer;
