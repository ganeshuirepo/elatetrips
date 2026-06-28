import { z } from 'zod';

const contactSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  phone: z.string().trim().min(6, 'Enter a valid phone').max(20),
  email: z.string().trim().email('Enter a valid email').max(160).or(z.literal('')).default(''),
});

export const createWeddingEnquirySchema = z.object({
  contact: contactSchema,
  preWeddingGuests: z.string().trim().min(1, 'Select pre-wedding guest count').max(40),
  postWeddingGuests: z.string().trim().min(1, 'Select post-wedding guest count').max(40),
  services: z.array(z.string().max(60)).max(30).default([]),
  weddingDate: z.string().trim().min(1, 'Wedding date is required').max(40),
  preferredHotels: z.string().max(500).default(''),
  destination: z.string().max(120).default(''),
  notes: z.string().max(2000).default(''),
});
