import { configureStore } from '@reduxjs/toolkit';
import uiReducer from './slices/uiSlice';
import cartReducer from './slices/cartSlice';
import planReducer from './slices/planSlice';
import transportReducer from './slices/transportSlice';
import servicesReducer from './slices/servicesSlice';
import hotelReducer from './slices/hotelSlice';
import addonsReducer from './slices/addonsSlice';
import reviewReducer from './slices/reviewSlice';
import ordersReducer from './slices/ordersSlice';
import accountReducer from './slices/accountSlice';
import { photonApi } from './photonApi';
import { elateApi } from './elateApi';
import { listenerMiddleware } from './listeners';

/**
 * Root store. Feature slices are added per migration phase
 * (hotel, addons, review still to come).
 */
export const makeStore = () =>
  configureStore({
    reducer: {
      ui: uiReducer,
      cart: cartReducer,
      plan: planReducer,
      transport: transportReducer,
      services: servicesReducer,
      hotel: hotelReducer,
      addons: addonsReducer,
      review: reviewReducer,
      orders: ordersReducer,
      account: accountReducer,
      [photonApi.reducerPath]: photonApi.reducer,
      [elateApi.reducerPath]: elateApi.reducer,
    },
    middleware: (getDefault) =>
      getDefault()
        .prepend(listenerMiddleware.middleware)
        .concat(photonApi.middleware, elateApi.middleware),
  });

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
