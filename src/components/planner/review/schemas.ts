import { z } from 'zod';

/** Validation schemas for the review forms. */

export const contactSchema = z.object({
  contactName: z.string().min(2, 'Enter a name'),
  contactPhone: z.string().regex(/^\d{10}$/, 'Enter a 10-digit phone'),
  contactEmail: z.string().email('Enter a valid email'),
});

export const billingSchema = z.object({
  billName: z.string().min(2, 'Enter a name'),
  billEmail: z.string().email('Enter a valid email'),
  billAddr: z.string().min(4, 'Enter an address'),
  billCity: z.string().min(2, 'Enter a city'),
  billPin: z.string().regex(/^\d{6}$/, 'Enter a 6-digit PIN'),
  billGst: z.string().optional().or(z.literal('')),
});

export type ContactForm = z.infer<typeof contactSchema>;
export type BillingForm = z.infer<typeof billingSchema>;
