'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { makeStore } from './store';
import { SESSION_KEY } from './listeners';
import { setSession, type Session } from './slices/accountSlice';

/**
 * Client-side Redux provider. The store is created once per client via a lazy
 * useState initializer (Next.js App Router pattern). After mount it rehydrates a
 * persisted auth session from localStorage (done in an effect, not during render,
 * to avoid SSR hydration mismatches).
 */
export default function StoreProvider({ children }: { children: ReactNode }) {
  const [store] = useState(makeStore);
  const restored = useRef(false);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const raw = window.localStorage.getItem(SESSION_KEY);
      if (raw) {
        const session = JSON.parse(raw) as Session;
        if (session?.token && session?.user) store.dispatch(setSession(session));
      }
    } catch {
      /* ignore malformed storage */
    }
  }, [store]);

  return <Provider store={store}>{children}</Provider>;
}
