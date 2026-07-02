'use client';

import { useState } from 'react';
import Button from '@mui/material/Button';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setStep } from '@/store/slices/uiSlice';
import { setAppliedCoupon, clearCoupon } from '@/store/slices/reviewSlice';
import { selectOrderGross, selectDiscount, selectPayable } from '@/store/selectors/paymentSelectors';
import { applyCoupon } from '@/domain/coupons';
import { inr } from '@/domain/format';
import ReviewSummary from './ReviewSummary';
import AuthOtp from './AuthOtp';
import ContactForm from './ContactForm';
import BillingForm from './BillingForm';
import ShareGuests from './ShareGuests';
import Icon from '@/components/ui/Icon';

/** Coupon entry — DEALNOW gives a 10% instant discount (max ₹500). */
function CouponBox() {
  const dispatch = useAppDispatch();
  const applied = useAppSelector((s) => s.review.coupon);
  const gross = useAppSelector(selectOrderGross);
  const discount = useAppSelector(selectDiscount);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  const onApply = () => {
    const result = applyCoupon(code, gross);
    setMessage(result.message);
    setIsError(!result.valid);
    if (result.valid) {
      dispatch(setAppliedCoupon(code));
      setCode('');
    }
  };

  const onRemove = () => {
    dispatch(clearCoupon());
    setMessage('');
    setIsError(false);
  };

  return (
    <div className="border-line flex flex-col gap-2 rounded-[14px] border bg-white p-4">
      <span className="text-ink flex items-center gap-2 text-[14px] font-extrabold">
        <Icon name="discount-2" size={17} style={{ color: 'var(--primary)' }} /> Coupon code
      </span>
      {applied ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-[13px] font-bold text-[#1E7A3A]">
            <Icon name="circle-check" size={16} /> {applied} applied — you save {inr(discount)}
          </span>
          <Button size="small" variant="text" onClick={onRemove}>
            Remove
          </Button>
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <input
              className="text-ink min-w-0 flex-1 rounded-[10px] border border-[color:var(--line)] px-3 py-2 text-[14px] uppercase outline-none"
              placeholder="Try DEALNOW"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onApply()}
            />
            <Button variant="outlined" color="primary" disabled={!code.trim()} onClick={onApply}>
              Apply
            </Button>
          </div>
          {message && (
            <span
              className="text-[12.5px] font-semibold"
              style={{ color: isError ? '#C0392B' : '#1E7A3A' }}
            >
              {message}
            </span>
          )}
        </>
      )}
    </div>
  );
}

/** Step 5 — review, sign in, contact/billing, coupon, then on to payment. */
export default function ReviewStep() {
  const dispatch = useAppDispatch();
  const loggedIn = useAppSelector((s) => !!s.account.token);
  const payable = useAppSelector(selectPayable);

  return (
    <div
      className="grid items-start gap-6"
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 22rem), 1fr))' }}
    >
      <ReviewSummary />

      <div className="flex flex-col gap-4">
        <AuthOtp />
        {loggedIn && (
          <>
            <ContactForm />
            <BillingForm />
            <ShareGuests />
            <CouponBox />
          </>
        )}

        <div className="border-line flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <Button variant="text" color="primary" onClick={() => dispatch(setStep('stay'))}>
            Back
          </Button>
          <Button
            variant="contained"
            color="primary"
            size="large"
            disabled={!loggedIn || payable <= 0}
            onClick={() => dispatch(setStep('payment'))}
            endIcon={<Icon name="arrow-right" size={18} />}
          >
            Proceed to payment · {inr(payable)}
          </Button>
        </div>
      </div>
    </div>
  );
}
