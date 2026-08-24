/**
 * Zod schemas guarding the supplier endpoints. The shared `validate()` middleware
 * runs these against req.params/query/body at the route edge and REPLACES those
 * parts with the parsed, typed result — so the controller reads clean data and
 * never touches raw request fields. Mirrors `catalog.validation.ts`.
 *
 * These schemas enforce STRUCTURE (types, required fields, enums). Business rules
 * — the 2h TAT floor, cap sizes, vetting completeness — live in config + the
 * service (BR-17), never as literals here.
 */
import { z } from 'zod';

const track = z.enum(['A', 'B']);
const supplierType = z.enum(['dmc', 'hotel', 'adventure', 'experience', 'transport']);
const capTier = z.enum(['primary', 'bench', 'reserve']);
const status = z.enum(['invited', 'vetting', 'active', 'bench', 'probation', 'paused']);

const commsConsent = z
  .object({
    sms: z.boolean().optional(),
    email: z.boolean().optional(),
    whatsapp: z.boolean().optional(),
    voice: z.boolean().optional(),
  })
  .strict();

const contact = z
  .object({
    role: z.enum(['owner', 'quoter', 'banquet_sales', 'emergency']),
    name: z.string().trim().min(1),
    email: z.string().trim().email().optional(),
    phone: z.string().trim().min(1).optional(),
    otp_verified: z.boolean().default(false),
  })
  .strict();

const vetting = z
  .object({
    registered_entity: z.boolean().optional(),
    gstin: z.string().trim().min(1).optional(),
    tourism_registration: z.string().trim().min(1).optional(),
    liability_insurance: z.boolean().optional(),
    emergency_protocol: z.boolean().optional(),
    references_count: z.number().int().nonnegative().optional(),
    sample_reviewed: z.boolean().optional(),
    rate_card_ref: z.string().trim().min(1).optional(),
  })
  .strict();

const scorecard = z
  .object({
    rank: z.number().int().nullable().optional(),
    fairness_debt: z.number().nullable().optional(),
  })
  .strict();

/** POST /suppliers — invite/create. `declared_tat_hours` is only bounded > 0
 *  here; the platform 2h FLOOR is a config-driven service check (BR-17). */
export const createSupplierBodySchema = z
  .object({
    supplier_id: z.string().trim().min(1).max(128),
    type: supplierType,
    name: z.string().trim().min(1),
    destinations: z.array(z.string().trim().min(1)).min(1),
    track,
    declared_tat_hours: z.number().positive(),
    channel_pref: z.enum(['email', 'whatsapp']).optional(),
    comms_consent: commsConsent.optional(),
    contacts: z.array(contact).optional(),
    vetting: vetting.optional(),
  })
  .strict();

/** PATCH /suppliers/:id — manual edit. */
export const updateSupplierBodySchema = z
  .object({
    type: supplierType.optional(),
    name: z.string().trim().min(1).optional(),
    destinations: z.array(z.string().trim().min(1)).min(1).optional(),
    track: track.optional(),
    declared_tat_hours: z.number().positive().optional(),
    channel_pref: z.enum(['email', 'whatsapp']).optional(),
    comms_consent: commsConsent.optional(),
    contacts: z.array(contact).optional(),
    vetting: vetting.optional(),
    quality_tier: z.enum(['preferred', 'standard', 'probation']).optional(),
    scorecard: scorecard.optional(),
  })
  .strict();

/** POST /suppliers/:id/tat — declare/renegotiate TAT. */
export const declareTatBodySchema = z.object({ declared_tat_hours: z.number().positive() }).strict();

/** POST /suppliers/:id/contract — clickwrap e-acceptance (FR3.10). */
export const acceptContractBodySchema = z
  .object({
    version: z.string().trim().min(1),
    content_hash: z.string().trim().min(1),
    accepted_ts: z.string().trim().min(1),
    ip: z.string().trim().min(1),
    signatory_name: z.string().trim().min(1),
    signatory_role: z.string().trim().min(1),
  })
  .strict();

/** GET /suppliers — directory filter. */
export const directoryQuerySchema = z.object({
  destination: z.string().trim().min(1).max(64).optional(),
  track: track.optional(),
});

/** GET /suppliers/candidates — FR3.8 candidate query. */
export const candidateQuerySchema = z.object({
  destination: z.string().trim().min(1).max(64),
  track: track.optional(),
  tier: capTier.optional(),
  status: status.optional(),
  current_contract_version: z.string().trim().min(1).optional(),
});

/** Any :id path param. */
export const idParamSchema = z.object({ id: z.string().trim().min(1).max(128) });
