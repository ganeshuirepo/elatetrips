import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { DEFAULT_THEME, type ThemeId } from '@/theme/palettes';

/** Top-level view: the planner wizard, the two shop catalogues, or partner EOI. */
export type AppView = 'planner' | 'gifts' | 'medical' | 'partner';

/** Wizard steps within the planner view. */
export type WizardStep = 'plan' | 'cab' | 'stay' | 'shop' | 'review';

/** Which form the global auth dialog opens to. */
export type AuthMode = 'login' | 'signup' | 'forgot';

export interface UiState {
  themeId: ThemeId;
  view: AppView;
  step: WizardStep;
  heroShown: boolean;
  /** Transient open/close flags for popovers (replaces the old document mousedown handler). */
  destOpen: boolean;
  calOpen: boolean;
  travOpen: boolean;
  pickupOpen: boolean;
  /** Global auth dialog. */
  authOpen: boolean;
  authMode: AuthMode;
}

const initialState: UiState = {
  themeId: DEFAULT_THEME,
  view: 'planner',
  step: 'plan',
  heroShown: true,
  destOpen: false,
  calOpen: false,
  travOpen: false,
  pickupOpen: false,
  authOpen: false,
  authMode: 'login',
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setTheme(state, action: PayloadAction<ThemeId>) {
      state.themeId = action.payload;
    },
    setView(state, action: PayloadAction<AppView>) {
      state.view = action.payload;
    },
    setStep(state, action: PayloadAction<WizardStep>) {
      state.step = action.payload;
    },
    setHeroShown(state, action: PayloadAction<boolean>) {
      state.heroShown = action.payload;
    },
    openAuth(state, action: PayloadAction<AuthMode>) {
      state.authOpen = true;
      state.authMode = action.payload;
    },
    closeAuth(state) {
      state.authOpen = false;
    },
    /** Open exactly one popover, closing the mutually-exclusive ones. */
    openOnly(
      state,
      action: PayloadAction<
        keyof Pick<UiState, 'destOpen' | 'calOpen' | 'travOpen' | 'pickupOpen'>
      >,
    ) {
      state.destOpen = false;
      state.calOpen = false;
      state.travOpen = false;
      state.pickupOpen = false;
      state[action.payload] = true;
    },
    closeAllPopovers(state) {
      state.destOpen = false;
      state.calOpen = false;
      state.travOpen = false;
      state.pickupOpen = false;
    },
    setPopover(
      state,
      action: PayloadAction<{
        key: keyof Pick<UiState, 'destOpen' | 'calOpen' | 'travOpen' | 'pickupOpen'>;
        open: boolean;
      }>,
    ) {
      state[action.payload.key] = action.payload.open;
    },
  },
});

export const {
  setTheme,
  setView,
  setStep,
  setHeroShown,
  openAuth,
  closeAuth,
  openOnly,
  closeAllPopovers,
  setPopover,
} = uiSlice.actions;
export default uiSlice.reducer;
