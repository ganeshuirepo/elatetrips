'use client';

import { useState } from 'react';
import Button from '@mui/material/Button';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setStep } from '@/store/slices/uiSlice';
import { selectReviewSummary } from '@/store/selectors/reviewSelectors';
import { selectCartLines } from '@/store/selectors/unifiedCartSelectors';
import { selectOrderGross, selectDiscount, selectPayable } from '@/store/selectors/paymentSelectors';
import { useCreateOrderMutation } from '@/store/elateApi';
import { inr } from '@/domain/format';
import Icon from '@/components/ui/Icon';

const METHODS = [
  { id: 'upi', label: 'UPI', icon: 'device-mobile', sub: 'GPay, PhonePe, Paytm' },
  { id: 'card', label: 'Card', icon: 'credit-card', sub: 'Credit or debit card' },
  { id: 'netbanking', label: 'Net banking', icon: 'building-bank', sub: 'All major banks' },
];

const errMsg = (err: unknown): string =>
  (err as { data?: { error?: { message?: string } } })?.data?.error?.message ??
  'Could not confirm the booking. Please try again.';

/**
 * Mock payment gateway — simulates a charge, then creates the order. The
 * pay/confirm seam is where a real gateway (e.g. Razorpay test mode) slots in.
 */
export default function PaymentStep() {
  const dispatch = useAppDispatch();
  const review = useAppSelector((s) => s.review);
  const accountPhone = useAppSelector((s) => s.account.user?.phone ?? '');
  const summary = useAppSelector(selectReviewSummary);
  const cartLines = useAppSelector(selectCartLines);
  const gross = useAppSelector(selectOrderGross);
  const discount = useAppSelector(selectDiscount);
  const payable = useAppSelector(selectPayable);

  const [createOrder] = useCreateOrderMutation();
  const [method, setMethod] = useState('upi');
  const [paying, setPaying] = useState(false);
  const [tripId, setTripId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const pay = async () => {
    setError('');
    setPaying(true);
    try {
      // Mock gateway: pretend to process, then mint a transaction id.
      await new Promise((r) => setTimeout(r, 1400));
      const txnId = `MOCK-${method.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

      const order = await createOrder({
        total: payable,
        contactName: review.contactName,
        contactPhone: review.contactPhone || accountPhone,
        contactEmail: review.contactEmail,
        coupon: review.coupon,
        discount,
        payment: { method, txnId, status: 'paid' },
        summary: {
          ...summary,
          items: cartLines.map((l) => ({
            label: l.label,
            detail: l.detail,
            qty: l.qty,
            amount: l.amount,
          })),
        },
      }).unwrap();
      setTripId(order.tripId);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setPaying(false);
    }
  };

  if (tripId) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <Icon name="circle-check" size={56} style={{ color: '#1E7A3A' }} />
        <h2 className="text-primary m-0 font-serif text-2xl font-bold">Payment successful!</h2>
        <span className="bg-sand text-primary rounded-full px-4 py-1.5 text-[13px] font-extrabold">
          Trip ID: {tripId}
        </span>
        <p className="text-muted max-w-[460px] text-[13.5px]">
          {inr(payable)} paid{discount > 0 ? ` (you saved ${inr(discount)})` : ''}. Your booking is
          confirmed — find it anytime under your profile&apos;s{' '}
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
      {/* Amount card */}
      <div className="border-line flex flex-col gap-1 rounded-[16px] border bg-white p-4">
        <h3 className="text-primary m-0 mb-2 font-serif text-xl font-bold">Payment</h3>
        <div className="flex items-center justify-between px-1 py-1">
          <span className="text-muted text-[12.5px] font-bold">Order value</span>
          <span className="text-ink text-[13px] font-bold">{inr(gross)}</span>
        </div>
        {discount > 0 && (
          <div className="flex items-center justify-between px-1 py-1">
            <span className="text-[12.5px] font-bold text-[#1E7A3A]">
              Coupon ({review.coupon})
            </span>
            <span className="text-[13px] font-bold text-[#1E7A3A]">−{inr(discount)}</span>
          </div>
        )}
        <div className="bg-sand/60 mt-1 flex items-center justify-between rounded-[12px] px-3 py-2">
          <span className="text-ink text-[13px] font-extrabold">Amount payable</span>
          <span className="text-accent-ink text-[19px] font-extrabold">{inr(payable)}</span>
        </div>
        <p className="text-muted mt-2 flex items-center gap-2 text-[12px]">
          <Icon name="shield-check" size={15} style={{ color: 'var(--primary)' }} />
          Test mode — no real money moves. A payment gateway (Razorpay test keys) can replace this
          without changing the flow.
        </p>
      </div>

      {/* Method + pay */}
      <div className="flex flex-col gap-3">
        <div className="border-line flex flex-col gap-2 rounded-[14px] border bg-white p-4">
          <span className="text-ink text-[14px] font-extrabold">Pay with</span>
          {METHODS.map((m) => (
            <label
              key={m.id}
              className="flex cursor-pointer items-center gap-3 rounded-[12px] border-[1.5px] px-3 py-2.5"
              style={{
                borderColor: method === m.id ? 'var(--primary)' : 'var(--line)',
                background:
                  method === m.id ? 'color-mix(in srgb, var(--primary) 6%, #fff)' : '#fff',
              }}
            >
              <input
                type="radio"
                name="pay-method"
                checked={method === m.id}
                onChange={() => setMethod(m.id)}
              />
              <Icon name={m.icon} size={20} style={{ color: 'var(--primary)' }} />
              <span className="flex flex-col">
                <span className="text-ink text-[13.5px] font-bold">{m.label}</span>
                <span className="text-muted text-[11.5px]">{m.sub}</span>
              </span>
            </label>
          ))}
        </div>

        {error && (
          <div className="rounded-[10px] bg-[#FDECEC] px-3 py-2 text-[12.5px] font-semibold text-[#C0392B]">
            {error}
          </div>
        )}

        <div className="border-line flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <Button
            variant="text"
            color="primary"
            disabled={paying}
            onClick={() => dispatch(setStep('review'))}
          >
            Back to review
          </Button>
          <Button
            variant="contained"
            color="primary"
            size="large"
            disabled={paying || payable <= 0}
            onClick={pay}
            startIcon={<Icon name={paying ? 'loader-2' : 'lock'} size={18} />}
          >
            {paying ? 'Processing…' : `Pay ${inr(payable)}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
