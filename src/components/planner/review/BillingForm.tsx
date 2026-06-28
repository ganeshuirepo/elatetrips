'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Button from '@mui/material/Button';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setBilling } from '@/store/slices/reviewSlice';
import { billingSchema, type BillingForm as BillingValues } from './schemas';
import Field from './Field';

/** Billing details form (React Hook Form + Zod), persisted to Redux on save. */
export default function BillingForm() {
  const dispatch = useAppDispatch();
  const review = useAppSelector((s) => s.review);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitSuccessful },
  } = useForm<BillingValues>({
    resolver: zodResolver(billingSchema),
    defaultValues: {
      billName: review.billName,
      billEmail: review.billEmail,
      billAddr: review.billAddr,
      billCity: review.billCity,
      billPin: review.billPin,
      billGst: review.billGst,
    },
  });

  const onSubmit = (values: BillingValues) => dispatch(setBilling(values));

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="border-line flex flex-col gap-3 rounded-[14px] border bg-white p-4"
    >
      <span className="text-ink text-[14px] font-extrabold">Billing details</span>
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 13rem), 1fr))' }}
      >
        <Field label="Name" error={errors.billName?.message} {...register('billName')} />
        <Field
          label="Email"
          type="email"
          error={errors.billEmail?.message}
          {...register('billEmail')}
        />
        <Field label="Address" error={errors.billAddr?.message} {...register('billAddr')} />
        <Field label="City" error={errors.billCity?.message} {...register('billCity')} />
        <Field
          label="PIN code"
          inputMode="numeric"
          error={errors.billPin?.message}
          {...register('billPin')}
        />
        <Field label="GST (optional)" error={errors.billGst?.message} {...register('billGst')} />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="outlined" color="primary" size="small">
          Save billing
        </Button>
        {isSubmitSuccessful && (
          <span className="text-[12.5px] font-semibold text-[#1E7A3A]">Saved ✓</span>
        )}
      </div>
    </form>
  );
}
