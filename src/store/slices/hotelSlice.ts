import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { HOTEL_PRICE_MAX } from '@/data/hotels';

type ArrayFilterKey =
  | 'hStars'
  | 'hAmen'
  | 'hAct'
  | 'hRoomSize'
  | 'hRoomView'
  | 'hClimate'
  | 'hPropType';

/** Step 3 hotel filters + selection + detail-panel state. */
export interface HotelState {
  hStars: string[];
  hAmen: string[];
  hAct: string[];
  hRoomSize: string[];
  hRoomView: string[];
  hClimate: string[];
  hPropType: string[];
  hPrice: number;
  /** Selected hotel id (in the list). */
  hHotel: string;
  /** Hotel id whose detail page is open (empty = list view). */
  hOpen: string;
  /** Selected room id on the detail page. */
  hRoom: string;
  detailPanel: { pkg: boolean; exp: boolean };
}

const initialState: HotelState = {
  hStars: [],
  hAmen: [],
  hAct: [],
  hRoomSize: [],
  hRoomView: [],
  hClimate: [],
  hPropType: [],
  hPrice: HOTEL_PRICE_MAX,
  hHotel: '',
  hOpen: '',
  hRoom: '',
  detailPanel: { pkg: true, exp: false },
};

const hotelSlice = createSlice({
  name: 'hotel',
  initialState,
  reducers: {
    toggleFilter(state, action: PayloadAction<{ key: ArrayFilterKey; value: string }>) {
      const { key, value } = action.payload;
      const arr = state[key];
      state[key] = arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value];
    },
    setHPrice(state, action: PayloadAction<number>) {
      state.hPrice = action.payload;
    },
    clearFilters(state) {
      state.hStars = [];
      state.hAmen = [];
      state.hAct = [];
      state.hRoomSize = [];
      state.hRoomView = [];
      state.hClimate = [];
      state.hPropType = [];
      state.hPrice = HOTEL_PRICE_MAX;
    },
    selectHotel(state, action: PayloadAction<string>) {
      state.hHotel = state.hHotel === action.payload ? '' : action.payload;
    },
    openHotelDetail(state, action: PayloadAction<string>) {
      state.hOpen = action.payload;
    },
    closeHotelDetail(state) {
      state.hOpen = '';
    },
    /** Expand/collapse a listing inline (only one open at a time). */
    toggleHotelExpand(state, action: PayloadAction<string>) {
      state.hOpen = state.hOpen === action.payload ? '' : action.payload;
    },
    selectRoom(state, action: PayloadAction<{ id: string; room: string }>) {
      state.hHotel = action.payload.id;
      state.hRoom = action.payload.room;
    },
    toggleDetailPanel(state, action: PayloadAction<'pkg' | 'exp'>) {
      const k = action.payload;
      state.detailPanel[k] = !state.detailPanel[k];
    },
  },
});

export const {
  toggleFilter,
  setHPrice,
  clearFilters,
  selectHotel,
  openHotelDetail,
  closeHotelDetail,
  toggleHotelExpand,
  selectRoom,
  toggleDetailPanel,
} = hotelSlice.actions;
export default hotelSlice.reducer;
