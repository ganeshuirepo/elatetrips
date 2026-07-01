'use client';

import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setView } from '@/store/slices/uiSlice';
import CartPill from './CartPill';
import UserProfile from './UserProfile';

/** Top bar: brand + shop navigation. Sticky, with a blurred bar once scrolled. */
export default function Header() {
  const dispatch = useAppDispatch();
  const view = useAppSelector((s) => s.ui.view);
  const [scrolled, setScrolled] = useState(false);

  // Fade in the translucent bar only after the page has scrolled a little.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const navLink = (active: boolean) =>
    `cursor-pointer border-none bg-transparent p-0 text-[13.5px] font-medium tracking-wide transition-colors ${
      active ? 'text-[var(--accent)]' : 'text-white/75 hover:text-white'
    }`;

  return (
    <header
      className={`sticky top-0 z-40 transition-[background,box-shadow,border-color] duration-300 ${
        scrolled ? 'backdrop-blur-md' : ''
      }`}
      style={
        scrolled
          ? {
              background: 'color-mix(in srgb, var(--bg2) 86%, transparent)',
              borderBottom: '1px solid color-mix(in srgb, #ffffff 9%, transparent)',
              boxShadow: '0 12px 34px -22px rgba(0,0,0,.85)',
            }
          : { borderBottom: '1px solid transparent' }
      }
    >
      <div className="mx-auto flex max-w-[1080px] flex-wrap items-center justify-between gap-3 px-6 py-[18px]">
      <div className="flex items-center gap-3">
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
        <span
          className="hidden text-[10.5px] font-semibold tracking-[0.18em] uppercase sm:inline-block"
          style={{
            color: 'var(--accent)',
            borderLeft: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
            paddingLeft: '12px',
          }}
        >
          Celebration-first travel
        </span>
      </div>

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
      </div>
    </header>
  );
}
