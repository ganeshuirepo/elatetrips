'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Button from '@mui/material/Button';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setContact } from '@/store/slices/reviewSlice';
import { contactSchema, type ContactForm as ContactValues } from './schemas';
import Field from './Field';

/** Contact details form (React Hook Form + Zod), persisted to Redux on save. */
export default function ContactForm() {
  const dispatch = useAppDispatch();
  const review = useAppSelector((s) => s.review);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitSuccessful },
  } = useForm<ContactValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      contactName: review.contactName,
      contactPhone: review.contactPhone,
      contactEmail: review.contactEmail,
    },
  });

  const onSubmit = (values: ContactValues) => dispatch(setContact(values));

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="border-line flex flex-col gap-3 rounded-[14px] border bg-white p-4"
    >
      <span className="text-ink text-[14px] font-extrabold">Contact details</span>
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 13rem), 1fr))' }}
      >
        <Field label="Full name" error={errors.contactName?.message} {...register('contactName')} />
        <Field
          label="Phone"
          inputMode="numeric"
          error={errors.contactPhone?.message}
          {...register('contactPhone')}
        />
        <Field
          label="Email"
          type="email"
          error={errors.contactEmail?.message}
          {...register('contactEmail')}
        />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="outlined" color="primary" size="small">
          Save contact
        </Button>
        {isSubmitSuccessful && (
          <span className="text-[12.5px] font-semibold text-[#1E7A3A]">Saved ✓</span>
        )}
      </div>
    </form>
  );
}
