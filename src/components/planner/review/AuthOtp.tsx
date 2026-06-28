'use client';

import Button from '@mui/material/Button';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { clearSession } from '@/store/slices/accountSlice';
import { openAuth } from '@/store/slices/uiSlice';
import Icon from '@/components/ui/Icon';

/** Sign-in gate on the review step — reflects the global auth session. */
export default function AuthOtp() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.account.user);
  const loggedIn = useAppSelector((s) => !!s.account.token);

  if (loggedIn) {
    return (
      <div className="border-line flex flex-wrap items-center justify-between gap-3 rounded-[14px] border bg-white p-4">
        <span className="text-ink flex items-center gap-2 text-[13.5px] font-bold">
          <Icon name="circle-check" size={18} style={{ color: '#1E7A3A' }} />
          Signed in as {user?.name || `+91 ${user?.phone}`}
        </span>
        <Button size="small" variant="text" onClick={() => dispatch(clearSession())}>
          Sign out
        </Button>
      </div>
    );
  }

  return (
    <div className="border-line flex flex-col gap-3 rounded-[14px] border bg-white p-4">
      <span className="text-ink flex items-center gap-2 text-[14px] font-extrabold">
        <Icon name="lock" size={17} style={{ color: 'var(--primary)' }} /> Sign in to confirm
      </span>
      <p className="text-muted text-[12.5px]">
        Sign in or create an account to confirm your celebration plan.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="contained" color="primary" onClick={() => dispatch(openAuth('login'))}>
          Sign in
        </Button>
        <Button variant="outlined" color="primary" onClick={() => dispatch(openAuth('signup'))}>
          Create account
        </Button>
      </div>
    </div>
  );
}
