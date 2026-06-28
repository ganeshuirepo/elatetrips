import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { validVehicleIds } from '@/domain/rules';

export type TransportMode = '' | 'own' | 'cab';
export type TripType = '' | 'local' | 'endtoend';

/** Step 2 transport choices + OSM pickup search results. */
export interface TransportState {
  tMode: TransportMode;
  tTrip: TripType;
  tVehicle: string;
  tDays: number;
  pickupCity: string;
  pickupAddr: string;
  pickupQuery: string;
  pickupLat: number | null;
  pickupLon: number | null;
  geoStatus: '' | 'locating' | 'denied' | 'unsupported' | 'outside' | 'error';
}

const initialState: TransportState = {
  tMode: '',
  tTrip: '',
  tVehicle: '',
  tDays: 1,
  pickupCity: '',
  pickupAddr: '',
  pickupQuery: '',
  pickupLat: null,
  pickupLon: null,
  geoStatus: '',
};

const transportSlice = createSlice({
  name: 'transport',
  initialState,
  reducers: {
    setTMode(state, action: PayloadAction<TransportMode>) {
      state.tMode = action.payload;
    },
    setTTrip(state, action: PayloadAction<TripType>) {
      state.tTrip = action.payload;
    },
    setTVehicle(state, action: PayloadAction<string>) {
      state.tVehicle = action.payload;
    },
    setTDays(state, action: PayloadAction<number>) {
      state.tDays = Math.max(1, action.payload || 1);
    },
    /** Clears the selected vehicle if it is no longer valid for the pax count. */
    clearVehicleIfInvalid(state, action: PayloadAction<number>) {
      if (state.tVehicle && !validVehicleIds(action.payload).includes(state.tVehicle)) {
        state.tVehicle = '';
      }
    },
    setPickupCity(state, action: PayloadAction<string>) {
      state.pickupCity = action.payload;
    },
    setPickupAddr(state, action: PayloadAction<string>) {
      state.pickupAddr = action.payload;
    },
    setPickupQuery(state, action: PayloadAction<string>) {
      state.pickupQuery = action.payload;
    },
    choosePickup(
      state,
      action: PayloadAction<{ city: string; addr: string; lat: number | null; lon: number | null }>,
    ) {
      const { city, addr, lat, lon } = action.payload;
      state.pickupCity = city;
      state.pickupAddr = addr;
      state.pickupQuery = addr;
      state.pickupLat = lat;
      state.pickupLon = lon;
      state.geoStatus = '';
    },
    clearPickup(state) {
      state.pickupCity = '';
      state.pickupAddr = '';
      state.pickupQuery = '';
      state.pickupLat = null;
      state.pickupLon = null;
      state.geoStatus = '';
    },
    setGeoStatus(state, action: PayloadAction<TransportState['geoStatus']>) {
      state.geoStatus = action.payload;
    },
  },
});

export const {
  setTMode,
  setTTrip,
  setTVehicle,
  setTDays,
  clearVehicleIfInvalid,
  setPickupCity,
  setPickupAddr,
  setPickupQuery,
  choosePickup,
  clearPickup,
  setGeoStatus,
} = transportSlice.actions;
export default transportSlice.reducer;
