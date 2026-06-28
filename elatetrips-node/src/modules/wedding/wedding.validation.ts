import { z } from 'zod';

const contactSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  phone: z.string().trim().min(6, 'Enter a valid phone').max(20),
  email: z.string().trim().email('Enter a valid email').max(160).or(z.literal('')).default(''),
});

const ceremonySchema = z.object({
  type: z.string().trim().min(1).max(60),
  date: z.string().max(40).default(''),
});

export const createWeddingEnquirySchema = z.object({
  contact: contactSchema,
  weddingGuests: z.string().trim().min(1, 'Select wedding guest count').max(40),
  preCeremonies: z.array(ceremonySchema).max(20).default([]),
  postCeremonies: z.array(ceremonySchema).max(20).default([]),
  services: z.array(z.string().max(60)).max(30).default([]),
  weddingDate: z.string().trim().min(1, 'Wedding date is required').max(40),
  preferredHotels: z.string().max(500).default(''),
  destination: z.string().max(120).default(''),
  notes: z.string().max(2000).default(''),
});
