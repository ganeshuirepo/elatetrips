'use client';

import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setView } from '@/store/slices/uiSlice';
import ThemeSwitcher from './ThemeSwitcher';
import CartPill from './CartPill';
import UserProfile from './UserProfile';

/** Top bar: brand, shop navigation, cart pill and theme switcher. */
export default function Header() {
  const dispatch = useAppDispatch();
  const view = useAppSelector((s) => s.ui.view);

  const navLink = (active: boolean) =>
    `cursor-pointer border-none bg-transparent p-0 text-[13.5px] font-bold ${
      active ? 'text-primary' : 'text-muted'
    }`;

  return (
    <header className="mx-auto flex max-w-[1060px] flex-wrap items-center justify-between gap-3 px-6 py-[18px]">
      <button
        type="button"
        onClick={() => dispatch(setView('planner'))}
        className="text-primary cursor-pointer border-none bg-transparent p-0 font-serif text-[23px] font-bold tracking-[-0.01em]"
      >
        Elate<span className="text-accent">Trips</span>
      </button>

      <div className="flex flex-wrap items-center gap-[18px]">
        <nav className="text-muted flex flex-wrap items-center gap-[26px] text-[13.5px] font-bold">
          <button
            type="button"
            onClick={() => dispatch(setView('gifts'))}
            className={navLink(view === 'gifts')}
          >
            Surprise Gifts
          </button>
          <button
            type="button"
            onClick={() => dispatch(setView('medical'))}
            className={navLink(view === 'medical')}
          >
            Medical Kits
          </button>
          <a href="#" className="text-inherit no-underline">
            Partner with us
          </a>
        </nav>
        <CartPill />
        <UserProfile />
        <ThemeSwitcher />
      </div>
    </header>
  );
}
