'use client';

import { useRef, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { clearSession } from '@/store/slices/accountSlice';
import { openAuth } from '@/store/slices/uiSlice';
import { useGetOrdersQuery } from '@/store/elateApi';
import { useOutsideClick } from '@/hooks/useOutsideClick';
import { inr } from '@/domain/format';
import Icon from '@/components/ui/Icon';

const fmtBooked = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

type Tab = 'profile' | 'trips';

/** Top-bar account menu: login/signup, profile details, and the user's trips. */
export default function UserProfile() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.account.user);
  const token = useAppSelector((s) => s.account.token);
  const loggedIn = !!token;

  const { data: orders = [] } = useGetOrdersQuery(undefined, { skip: !loggedIn });

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('profile');
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, () => setOpen(false), open);

  const label = loggedIn ? user?.name || `+91 ${user?.phone}` : 'Login';

  const tabButton = (id: Tab, icon: string, text: string) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border-none py-1.5 text-[12.5px] font-bold"
      style={{
        background: tab === id ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'transparent',
        color: tab === id ? 'var(--primary)' : 'var(--muted)',
        cursor: 'pointer',
      }}
    >
      <Icon name={icon} size={15} /> {text}
    </button>
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="text-ink flex cursor-pointer items-center gap-1.5 rounded-full border-[1.5px] bg-white px-2.5 py-1.5 text-[13px] font-bold"
        style={{ borderColor: open ? 'var(--primary)' : 'var(--line)' }}
      >
        <Icon name="user-circle" size={18} style={{ color: 'var(--primary)' }} />
        <span className="max-w-[120px] truncate">{label}</span>
        <Icon
          name={open ? 'chevron-up' : 'chevron-down'}
          size={14}
          style={{ color: 'var(--muted)' }}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="border-line absolute top-[calc(100%+8px)] right-0 z-50 w-[300px] cursor-default rounded-[14px] border bg-white p-4 shadow-xl"
        >
          {!loggedIn ? (
            <div className="flex flex-col gap-3">
              <span className="text-ink flex items-center gap-2 text-[14px] font-extrabold">
                <Icon name="user" size={16} style={{ color: 'var(--primary)' }} /> Welcome to ElateTrips
              </span>
              <p className="text-muted text-[12.5px]">
                Sign in or create an account to plan celebrations and track your trips.
              </p>
              <button
                type="button"
                onClick={() => {
                  dispatch(openAuth('login'));
                  setOpen(false);
                }}
                className="rounded-[10px] border-none bg-[color:var(--primary)] py-2 text-[13px] font-bold text-white"
                style={{ cursor: 'pointer' }}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => {
                  dispatch(openAuth('signup'));
                  setOpen(false);
                }}
                className="text-primary rounded-[10px] border-[1.5px] border-[color:var(--line)] bg-white py-2 text-[13px] font-bold"
                style={{ cursor: 'pointer' }}
              >
                Create account
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="bg-sand/40 flex gap-1 rounded-[12px] p-1">
                {tabButton('profile', 'user', 'Profile')}
                {tabButton('trips', 'ticket', `Trips (${orders.length})`)}
              </div>

              {tab === 'profile' ? (
                <div className="text-muted flex flex-col gap-0.5 text-[12.5px]">
                  <span className="flex items-center gap-1.5">
                    <Icon name="user" size={14} /> {user?.name || 'Name not added'}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Icon name="phone" size={14} /> +91 {user?.phone}
                    {user?.mobileVerified && <Icon name="circle-check" size={13} style={{ color: '#1E7A3A' }} />}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Icon name="mail" size={14} /> {user?.email || 'Email not added'}
                    {user?.emailVerified && <Icon name="circle-check" size={13} style={{ color: '#1E7A3A' }} />}
                  </span>
                </div>
              ) : orders.length === 0 ? (
                <p className="text-muted text-[12.5px]">
                  No trips on this account yet. Confirm a plan to see it here.
                </p>
              ) : (
                <div className="flex max-h-[300px] flex-col gap-2 overflow-y-auto">
                  {orders.map((o) => (
                    <div key={o.tripId} className="border-line rounded-[12px] border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-ink flex items-center gap-1.5 text-[12.5px] font-extrabold">
                          <Icon name="ticket" size={14} style={{ color: 'var(--accent-ink)' }} />
                          {o.tripId}
                        </span>
                        <span className="rounded-full bg-[#E6F4EA] px-2 py-0.5 text-[10.5px] font-bold text-[#1E7A3A]">
                          Confirmed
                        </span>
                      </div>
                      <div className="text-muted mt-1 flex flex-col gap-0.5 text-[12px]">
                        <span className="text-ink font-semibold">{o.summary.destination}</span>
                        <span>{o.summary.dates}</span>
                        <span>{o.summary.hotelLabel}</span>
                        <span>{o.summary.travellers}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-muted text-[11px]">Booked {fmtBooked(o.createdAt)}</span>
                        <span className="text-accent-ink text-[13px] font-extrabold">{inr(o.total)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-line border-t" />

              <button
                type="button"
                onClick={() => {
                  dispatch(clearSession());
                  setOpen(false);
                  setTab('profile');
                }}
                className="text-muted flex cursor-pointer items-center gap-1.5 border-none bg-transparent p-0 text-[12.5px] font-bold"
              >
                <Icon name="logout" size={15} /> Sign out
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
