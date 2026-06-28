import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type Gender = 'male' | 'female' | 'other' | 'prefer_not_to_say' | '';

/** The signed-in account as returned by the backend (no password). */
export interface AccountUser {
  phone: string;
  email: string;
  name: string;
  gender: Gender;
  age: number | null;
  emailVerified: boolean;
  mobileVerified: boolean;
  status: 'pending' | 'active';
}

export interface Session {
  token: string;
  user: AccountUser;
}

interface AccountState {
  token: string | null;
  user: AccountUser | null;
}

const initialState: AccountState = { token: null, user: null };

/**
 * Holds the real authenticated session (JWT + user) issued by the backend.
 * Persistence to localStorage is handled by a listener so reducers stay pure.
 */
const accountSlice = createSlice({
  name: 'account',
  initialState,
  reducers: {
    setSession(state, action: PayloadAction<Session>) {
      state.token = action.payload.token;
      state.user = action.payload.user;
    },
    setUser(state, action: PayloadAction<AccountUser>) {
      state.user = action.payload;
    },
    clearSession(state) {
      state.token = null;
      state.user = null;
    },
  },
});

export const { setSession, setUser, clearSession } = accountSlice.actions;
export default accountSlice.reducer;
