import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface Guest {
  name: string;
  phone: string;
}

export interface ContactDetails {
  contactName: string;
  contactPhone: string;
  contactEmail: string;
}

export interface BillingDetails {
  billName: string;
  billEmail: string;
  billAddr: string;
  billCity: string;
  billPin: string;
  billGst: string;
}

/** Step 5 review state: OTP auth, contact + billing, coupon, share-with-guests. */
export interface ReviewState extends ContactDetails, BillingDetails {
  loggedIn: boolean;
  authPhone: string;
  authOtp: string;
  otpSent: boolean;
  shareGuests: Guest[];
  confirmed: boolean;
  /** Applied coupon code ('' = none). Discount is derived in selectors. */
  coupon: string;
}

const initialState: ReviewState = {
  loggedIn: false,
  authPhone: '',
  authOtp: '',
  otpSent: false,
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  billName: '',
  billEmail: '',
  billAddr: '',
  billCity: '',
  billPin: '',
  billGst: '',
  shareGuests: [],
  confirmed: false,
  coupon: '',
};

const reviewSlice = createSlice({
  name: 'review',
  initialState,
  reducers: {
    setAuthPhone(state, action: PayloadAction<string>) {
      state.authPhone = action.payload.replace(/[^0-9]/g, '').slice(0, 10);
    },
    setAuthOtp(state, action: PayloadAction<string>) {
      state.authOtp = action.payload.replace(/[^0-9]/g, '').slice(0, 4);
    },
    sendOtp(state) {
      if (state.authPhone.replace(/[^0-9]/g, '').length >= 10) {
        state.otpSent = true;
        state.authOtp = '';
      }
    },
    editPhone(state) {
      state.otpSent = false;
      state.authOtp = '';
    },
    verifyOtp(state) {
      if (state.authOtp.length === 4) {
        state.loggedIn = true;
        state.contactPhone = state.contactPhone || state.authPhone;
      }
    },
    signOut(state) {
      state.loggedIn = false;
      state.otpSent = false;
      state.authOtp = '';
    },
    setContact(state, action: PayloadAction<Partial<ContactDetails>>) {
      Object.assign(state, action.payload);
    },
    setBilling(state, action: PayloadAction<Partial<BillingDetails>>) {
      Object.assign(state, action.payload);
    },
    addGuest(state) {
      if (state.shareGuests.length < 2) state.shareGuests.push({ name: '', phone: '' });
    },
    removeGuest(state, action: PayloadAction<number>) {
      state.shareGuests.splice(action.payload, 1);
    },
    setGuest(state, action: PayloadAction<{ index: number; field: keyof Guest; value: string }>) {
      const { index, field, value } = action.payload;
      const g = state.shareGuests[index];
      if (!g) return;
      g[field] = field === 'phone' ? value.replace(/[^0-9]/g, '').slice(0, 10) : value;
    },
    confirmBooking(state) {
      state.confirmed = true;
    },
    setAppliedCoupon(state, action: PayloadAction<string>) {
      state.coupon = action.payload.trim().toUpperCase();
    },
    clearCoupon(state) {
      state.coupon = '';
    },
  },
});

export const {
  setAuthPhone,
  setAuthOtp,
  sendOtp,
  editPhone,
  verifyOtp,
  signOut,
  setContact,
  setBilling,
  addGuest,
  removeGuest,
  setGuest,
  confirmBooking,
  setAppliedCoupon,
  clearCoupon,
} = reviewSlice.actions;
export default reviewSlice.reducer;
