'use client';

import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setView } from '@/store/slices/uiSlice';
import CartPill from './CartPill';
import UserProfile from './UserProfile';

/** Top bar: brand + shop navigation, on the dark luxury canvas. */
export default function Header() {
  const dispatch = useAppDispatch();
  const view = useAppSelector((s) => s.ui.view);

  const navLink = (active: boolean) =>
    `cursor-pointer border-none bg-transparent p-0 text-[13.5px] font-medium tracking-wide transition-colors ${
      active ? 'text-[var(--accent)]' : 'text-white/75 hover:text-white'
    }`;

  return (
    <header className="mx-auto flex max-w-[1080px] flex-wrap items-center justify-between gap-3 px-6 py-[22px]">
      <button
        type="button"
        onClick={() => dispatch(setView('planner'))}
        className="cursor-pointer border-none bg-transparent p-0 font-serif text-[26px] font-medium tracking-wide"
        style={{
          background: 'linear-gradient(90deg, #e9c97f, #d4a94f, #e9c97f)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
        }}
      >
        ElateTrips
      </button>

      <div className="flex flex-wrap items-center gap-[20px]">
        <nav className="flex flex-wrap items-center gap-[26px]">
          <button
            type="button"
            onClick={() => dispatch(setView('wedding'))}
            className={navLink(view === 'wedding')}
          >
            Destination Wedding
          </button>
          <button
            type="button"
            onClick={() => dispatch(setView('gifts'))}
            className={navLink(view === 'gifts')}
          >
            Surprise Gifts
          </button>
          <button
            type="button"
            onClick={() => dispatch(setView('partner'))}
            className={navLink(view === 'partner')}
          >
            Partner with us
          </button>
        </nav>
        <CartPill />
        <UserProfile />
      </div>
    </header>
  );
}
