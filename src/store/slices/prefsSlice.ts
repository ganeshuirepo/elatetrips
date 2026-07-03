import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { ItineraryDay } from '@/domain/itinerary';

/**
 * Preferences step state: what the traveller cares about (place interests +
 * celebration-service types) and the generated day-wise itinerary. The
 * itinerary is stored with the inputs it was built from so the UI can offer a
 * refresh when dates or interests change.
 */
export interface PrefsState {
  /** Place-interest tag ids (gardens, viewpoints, wildlife…). */
  interests: string[];
  /** Service-type ids the user wants for the celebration (decor, music…). */
  servicePrefs: string[];
  itinerary: ItineraryDay[] | null;
  /** Fingerprint of the inputs the itinerary was generated from. */
  generatedFor: string;
}

const initialState: PrefsState = {
  interests: [],
  servicePrefs: [],
  itinerary: null,
  generatedFor: '',
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
    setItinerary(state, action: PayloadAction<{ days: ItineraryDay[]; fingerprint: string }>) {
      state.itinerary = action.payload.days;
      state.generatedFor = action.payload.fingerprint;
    },
    clearItinerary(state) {
      state.itinerary = null;
      state.generatedFor = '';
    },
  },
});

export const { toggleInterest, toggleServicePref, setItinerary, clearItinerary } =
  prefsSlice.actions;
export default prefsSlice.reducer;
