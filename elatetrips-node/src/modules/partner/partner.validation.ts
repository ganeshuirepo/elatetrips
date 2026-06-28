import { z } from 'zod';

const propertySchema = z.object({
  hotelName: z.string().trim().min(1, 'Hotel name is required').max(160),
  city: z.string().max(120).default(''),
  category: z.string().max(80).default(''),
  totalRooms: z.string().max(12).default(''),
  contactName: z.string().trim().min(1, 'Contact person is required').max(120),
  role: z.string().max(120).default(''),
  email: z.string().trim().email('Enter a valid email').max(160),
  phone: z.string().trim().min(6, 'Enter a valid phone').max(20),
});

const serviceSchema = z.object({
  service: z.string().min(1).max(60),
  packages: z.array(z.string().max(120)).max(40).optional(),
  fulfilment: z.string().max(80).default(''),
  leadTime: z.string().max(80).default(''),
  priceRange: z.string().max(120).default(''),
  capacityPerDay: z.string().max(12).default(''),
  notes: z.string().max(500).default(''),
});

const surpriseSchema = z.object({
  capable: z.string().min(1, 'Please choose an option').max(80),
  setupWindow: z.string().max(80).default(''),
  photoProof: z.string().max(40).default(''),
});

const inventorySchema = z.object({
  updateMethod: z.string().min(1, 'Please choose an update method').max(80),
  channelManagerOrPMS: z.string().max(160).default(''),
  updateFrequency: z.string().max(80).default(''),
  liveAvailability: z.string().max(80).default(''),
  roomsAllocated: z.string().max(12).default(''),
  rateModel: z.string().max(80).default(''),
  confirmationSLA: z.string().max(80).default(''),
});

export const createPartnerEoiSchema = z.object({
  property: propertySchema,
  services: z.array(serviceSchema).max(20).default([]),
  surprise: surpriseSchema,
  inventory: inventorySchema,
  notes: z.string().max(2000).default(''),
  consent: z.literal(true, {
    errorMap: () => ({ message: 'Consent is required to submit' }),
  }),
});
