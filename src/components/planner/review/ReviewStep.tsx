'use client';

import { useState } from 'react';
import Button from '@mui/material/Button';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setStep } from '@/store/slices/uiSlice';
import { selectReviewSummary } from '@/store/selectors/reviewSelectors';
import { selectCostSummary } from '@/store/selectors/addonsSelectors';
import { useCreateOrderMutation } from '@/store/elateApi';
import ReviewSummary from './ReviewSummary';
import AuthOtp from './AuthOtp';
import ContactForm from './ContactForm';
import BillingForm from './BillingForm';
import ShareGuests from './ShareGuests';
import Icon from '@/components/ui/Icon';

const errMsg = (err: unknown): string =>
  (err as { data?: { error?: { message?: string } } })?.data?.error?.message ??
  'Could not confirm the booking. Please try again.';

/** Step 5 — review, sign in, contact/billing, and confirm (persists to backend). */
export default function ReviewStep() {
  const dispatch = useAppDispatch();
  const loggedIn = useAppSelector((s) => !!s.account.token);
  const accountPhone = useAppSelector((s) => s.account.user?.phone ?? '');
  const review = useAppSelector((s) => s.review);
  const summary = useAppSelector(selectReviewSummary);
  const cost = useAppSelector(selectCostSummary);

  const [createOrder, { isLoading }] = useCreateOrderMutation();
  const [tripId, setTripId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const confirm = async () => {
    setError('');
    try {
      const order = await createOrder({
        total: cost.addonsTotal,
        contactName: review.contactName,
        contactPhone: review.contactPhone || accountPhone,
        contactEmail: review.contactEmail,
        summary,
      }).unwrap();
      setTripId(order.tripId);
    } catch (e) {
      setError(errMsg(e));
    }
  };

  if (tripId) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <Icon name="circle-check" size={56} style={{ color: '#1E7A3A' }} />
        <h2 className="text-primary m-0 font-serif text-2xl font-bold">Booking confirmed!</h2>
        <span className="bg-sand text-primary rounded-full px-4 py-1.5 text-[13px] font-extrabold">
          Trip ID: {tripId}
        </span>
        <p className="text-muted max-w-[460px] text-[13.5px]">
          Your celebration plan is locked in. Track it anytime under your profile&apos;s{' '}
          <span className="font-semibold">Trips</span>.
        </p>
      </div>
    );
  }

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
          </>
        )}

        {error && (
          <div className="rounded-[10px] bg-[#FDECEC] px-3 py-2 text-[12.5px] font-semibold text-[#C0392B]">
            {error}
          </div>
        )}

        <div className="border-line flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <Button variant="text" color="primary" onClick={() => dispatch(setStep('shop'))}>
            Back
          </Button>
          <Button
            variant="contained"
            color="primary"
            size="large"
            disabled={!loggedIn || isLoading}
            onClick={confirm}
            startIcon={<Icon name="circle-check" size={18} />}
          >
            {isLoading ? 'Confirming…' : 'Confirm booking'}
          </Button>
        </div>
      </div>
    </div>
  );
}
