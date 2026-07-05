import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { RootState } from './store';
import type { AccountUser, Gender, Session } from './slices/accountSlice';

/** Base URL of the ElateTrips backend (override via NEXT_PUBLIC_API_BASE). */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:4000/api/v1';

/** Unwraps the backend success envelope `{ success, data }` into just `data`. */
const pick =
  <T>() =>
  (res: unknown): T =>
    (res as { data: T }).data;

export interface OtpResult {
  identifier: string;
  channel: 'email' | 'mobile';
  sent: true;
  devOtp?: string;
}

export interface SignupBody {
  name: string;
  email: string;
  phone: string;
  gender: Gender;
  age: number;
  password: string;
  verifyVia: 'email' | 'mobile';
}

export interface OrderItem {
  label: string;
  detail: string;
  qty: number;
  amount: number;
}

export interface OrderSummary {
  destination: string;
  dates: string;
  travellers: string;
  transportLabel: string;
  hotelLabel: string;
  packages: { celeb: string; names: string[] }[];
  adventures: string[];
  experiences: string[];
  /** Cart lines (surprise gifts, services, stay) included in the order. */
  items?: OrderItem[];
}

export interface PaymentInfo {
  method: string;
  txnId: string;
  status: 'paid';
}

export interface Order {
  tripId: string;
  phone: string;
  status: string;
  total: number;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  coupon?: string;
  discount?: number;
  payment?: PaymentInfo;
  summary: OrderSummary;
  createdAt: string;
}

export interface CreateOrderBody {
  total: number;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  coupon?: string;
  discount?: number;
  payment?: PaymentInfo;
  summary: OrderSummary;
}

/** Partner tracks a vendor can onboard under (one form template each). */
export type PartnerType = 'hotel' | 'transport' | 'onground' | 'adventure' | 'guide' | 'gifting';

/** Business identity + primary contact, common to every partner track. */
export interface PartnerBusiness {
  businessName: string;
  city: string;
  contactName: string;
  role: string;
  email: string;
  phone: string;
}

/** One catalogue entry — a package, vehicle class, session, experience or SKU. */
export interface PortfolioItem {
  name: string;
  description: string;
  priceRange: string;
  link: string;
}

/**
 * Vendor "Expression of Interest" (Partner with us). `details` carries the
 * track-specific template answers keyed by field, so new template fields need
 * no API change; `portfolio` is the vendor's editable catalogue.
 */
export interface VendorEoiBody {
  partnerType: PartnerType;
  business: PartnerBusiness;
  details: Record<string, string | string[]>;
  portfolio: PortfolioItem[];
  notes: string;
  consent: true;
}

export interface VendorEoi extends VendorEoiBody {
  referenceId: string;
  createdAt: string;
  updatedAt: string;
}

/** A wedding-related ceremony: its type and the date it falls on. */
export interface WeddingCeremony {
  type: string;
  date: string;
}

/** Wedding enquiry submitted when the planner diverts on a Wedding selection. */
export interface WeddingEnquiryBody {
  contact: { name: string; phone: string; email: string };
  weddingGuests: string;
  preCeremonies: WeddingCeremony[];
  postCeremonies: WeddingCeremony[];
  services: string[];
  weddingDate: string;
  preferredHotels: string;
  destination: string;
  notes: string;
}

export interface WeddingEnquiry extends WeddingEnquiryBody {
  referenceId: string;
  createdAt: string;
}

/**
 * RTK Query client for the ElateTrips backend. The JWT is attached from the
 * account slice, and the success envelope is unwrapped so components receive the
 * payload directly. Errors surface as `error.data.error.message`.
 */
export const elateApi = createApi({
  reducerPath: 'elateApi',
  baseQuery: fetchBaseQuery({
    baseUrl: API_BASE,
    prepareHeaders: (headers, { getState }) => {
      const token = (getState() as RootState).account.token;
      if (token) headers.set('authorization', `Bearer ${token}`);
      return headers;
    },
  }),
  tagTypes: ['Orders', 'Profile'],
  endpoints: (build) => ({
    signup: build.mutation<OtpResult, SignupBody>({
      query: (body) => ({ url: '/auth/signup', method: 'POST', body }),
      transformResponse: pick<OtpResult>(),
    }),
    verifyAccount: build.mutation<Session, { identifier: string; otp: string }>({
      query: (body) => ({ url: '/auth/verify-account', method: 'POST', body }),
      transformResponse: pick<Session>(),
    }),
    login: build.mutation<Session, { identifier: string; password: string }>({
      query: (body) => ({ url: '/auth/login', method: 'POST', body }),
      transformResponse: pick<Session>(),
    }),
    forgotPassword: build.mutation<OtpResult, { identifier: string }>({
      query: (body) => ({ url: '/auth/forgot-password', method: 'POST', body }),
      transformResponse: pick<OtpResult>(),
    }),
    resetPassword: build.mutation<Session, { identifier: string; otp: string; password: string }>({
      query: (body) => ({ url: '/auth/reset-password', method: 'POST', body }),
      transformResponse: pick<Session>(),
    }),
    requestOtp: build.mutation<OtpResult, { identifier: string }>({
      query: (body) => ({ url: '/auth/request-otp', method: 'POST', body }),
      transformResponse: pick<OtpResult>(),
    }),
    resendOtp: build.mutation<OtpResult, { identifier: string }>({
      query: (body) => ({ url: '/auth/resend-otp', method: 'POST', body }),
      transformResponse: pick<OtpResult>(),
    }),
    verifyOtp: build.mutation<Session, { identifier: string; otp: string }>({
      query: (body) => ({ url: '/auth/verify-otp', method: 'POST', body }),
      transformResponse: pick<Session>(),
    }),
    getProfile: build.query<AccountUser, void>({
      query: () => '/users/me',
      transformResponse: pick<AccountUser>(),
      providesTags: ['Profile'],
    }),
    getOrders: build.query<Order[], void>({
      query: () => '/orders',
      transformResponse: pick<Order[]>(),
      providesTags: ['Orders'],
    }),
    createOrder: build.mutation<Order, CreateOrderBody>({
      query: (body) => ({ url: '/orders', method: 'POST', body }),
      transformResponse: pick<Order>(),
      invalidatesTags: ['Orders'],
    }),
    submitPartnerEoi: build.mutation<VendorEoi, VendorEoiBody>({
      query: (body) => ({ url: '/partners/eoi', method: 'POST', body }),
      transformResponse: pick<VendorEoi>(),
    }),
    // Ownership of an existing submission is asserted with the registered
    // email alongside the reference id (public form — no partner accounts yet).
    getPartnerEoi: build.query<VendorEoi, { referenceId: string; email: string }>({
      query: ({ referenceId, email }) => ({
        url: `/partners/eoi/${encodeURIComponent(referenceId.trim())}`,
        params: { email },
      }),
      transformResponse: pick<VendorEoi>(),
    }),
    updatePartnerEoi: build.mutation<
      VendorEoi,
      { referenceId: string; email: string; body: VendorEoiBody }
    >({
      query: ({ referenceId, email, body }) => ({
        url: `/partners/eoi/${encodeURIComponent(referenceId.trim())}`,
        method: 'PUT',
        params: { email },
        body,
      }),
      transformResponse: pick<VendorEoi>(),
    }),
    submitWeddingEnquiry: build.mutation<WeddingEnquiry, WeddingEnquiryBody>({
      query: (body) => ({ url: '/weddings/enquiry', method: 'POST', body }),
      transformResponse: pick<WeddingEnquiry>(),
    }),
  }),
});

export const {
  useSignupMutation,
  useVerifyAccountMutation,
  useLoginMutation,
  useForgotPasswordMutation,
  useResetPasswordMutation,
  useRequestOtpMutation,
  useResendOtpMutation,
  useVerifyOtpMutation,
  useGetProfileQuery,
  useGetOrdersQuery,
  useCreateOrderMutation,
  useSubmitPartnerEoiMutation,
  useGetPartnerEoiQuery,
  useLazyGetPartnerEoiQuery,
  useUpdatePartnerEoiMutation,
  useSubmitWeddingEnquiryMutation,
} = elateApi;
