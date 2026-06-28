'use client';

import Button from '@mui/material/Button';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setAuthPhone, setAuthOtp, sendOtp, editPhone, verifyOtp } from '@/store/slices/reviewSlice';

/**
 * Mock phone + OTP login (any 4 digits pass). Shared by the header account menu
 * and the Review step so both drive the same `review` auth state.
 */
export default function OtpLoginForm() {
  const dispatch = useAppDispatch();
  const { authPhone, authOtp, otpSent } = useAppSelector((s) => s.review);

  if (!otpSent) {
    return (
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-muted flex flex-1 flex-col gap-1 text-[12px] font-semibold">
          Mobile number
          <input
            inputMode="numeric"
            value={authPhone}
            onChange={(e) => dispatch(setAuthPhone(e.target.value))}
            placeholder="10-digit number"
            className="border-line text-ink rounded-[10px] border px-3 py-2 text-[14px] outline-none"
          />
        </label>
        <Button
          variant="contained"
          color="primary"
          disabled={authPhone.length < 10}
          onClick={() => dispatch(sendOtp())}
        >
          Send OTP
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-muted flex flex-1 flex-col gap-1 text-[12px] font-semibold">
        Enter OTP (any 4 digits)
        <input
          inputMode="numeric"
          value={authOtp}
          onChange={(e) => dispatch(setAuthOtp(e.target.value))}
          placeholder="4-digit OTP"
          className="border-line text-ink rounded-[10px] border px-3 py-2 text-[14px] tracking-[0.3em] outline-none"
        />
      </label>
      <Button variant="text" onClick={() => dispatch(editPhone())}>
        Edit phone
      </Button>
      <Button
        variant="contained"
        color="primary"
        disabled={authOtp.length !== 4}
        onClick={() => dispatch(verifyOtp())}
      >
        Verify
      </Button>
    </div>
  );
}
