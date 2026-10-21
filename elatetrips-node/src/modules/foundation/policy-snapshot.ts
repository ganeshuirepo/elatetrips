import { z } from 'zod';
import type { ITokenService } from '../auth/auth.types';
import { canonicalJson, type StorageKeys } from './encrypted-json';
import { authorizeResource, permissionPolicySchema, resolvePrincipal, type AccountDirectory, type MembershipDirectory, type VerifiedPrincipal } from './identity';
import { FoundationStoreError, openRecordTransaction, openVersionedStore } from './persistence';
import type { mongo } from 'mongoose';

const id = z.string().min(1).max(128).refine((s) => s.trim() === s && !s.includes('\0'));
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const percentage = integer.max(100); // Frozen policy.schema.json bounds, not economic defaults.
const date = z.string().date();
const bands = z.array(z.object({ days_before: integer, refund_pct: percentage }).strict());
/** Canonical policy core mirrors frozen contracts/policy.schema.json only. */
export const snapshotPolicySchema = z.object({
  policy_id: id, version: integer.positive(), scope: z.enum(['platform_default', 'partner', 'quote']),
  partner_id: id.optional(), quote_id: id.optional(), effective_from: date, effective_to: date.optional(),
  booking_terms: z.object({ deposit_pct: percentage.optional(), balance_due_days_before: integer.optional() }).strict().optional(),
  refund_bands: bands,
  peak_overrides: z.array(z.object({ from: date, to: date, refund_bands: bands }).strict()).optional(),
  flexibility_score: percentage.optional(),
}).strict();
const snapshotSchema = z.object({
  snapshotId: id, bookingId: id, quoteId: id, partnerId: id, tenantId: id, contextId: id,
  policy: snapshotPolicySchema, body: z.unknown(),
}).strict().refine((s) => 'body' in s);
const eventSchema = z.object({
  event_id: id, type: z.literal('policy.snapshotted'), actor: z.enum(['customer', 'ops', 'supplier', 'system', 'ai']),
  actor_id: id, role: z.enum(['customer', 'dmc', 'hotel', 'provider', 'ops', 'platform']),
  ts: z.string().datetime({ offset: true }),
  subject: z.object({ booking_id: id, quote_id: id.optional(), rfq_id: id.optional() }).strict(),
  before: z.null(), after: z.unknown(),
  payload: z.object({ booking_id: id, policy_id: id, version: integer.positive() }).strict(),
}).strict().refine((e) => 'after' in e);
const requestSchema = z.object({ commandId: id, correlationId: id, snapshot: snapshotSchema, event: eventSchema }).strict();
const scopeSchema = z.object({ kind: z.enum(['customer', 'organization', 'partner']), id }).strict();
const bindingSchema = z.object({
  bookingId: id, quoteId: id, partnerId: id, tenantId: id, contextId: id, scope: scopeSchema,
  eventActor: eventSchema.innerType().shape.actor, eventRole: eventSchema.innerType().shape.role,
}).strict();
const configurationSchema = z.object({
  adapterId: id, revision: integer.positive(), readAction: z.literal('booking.read'), writeAction: z.literal('booking.write'),
  transaction: z.object({ policyId: id, revision: integer.positive(), maxRecords: integer.positive().min(2) }).strict(),
}).strict();
const envelopeSchema = z.object({
  format: z.literal(1), request: requestSchema, binding: bindingSchema,
  configuration: configurationSchema, permissions: permissionPolicySchema,
}).strict();
const claimSchema = z.object({ format: z.literal(1), bookingId: id, eventId: id, snapshotId: id, commandId: id }).strict();
export type PolicySnapshot = z.infer<typeof snapshotSchema>;
export type PolicySnapshotEvent = z.infer<typeof eventSchema>;
export type PolicySnapshotConfiguration = z.infer<typeof configurationSchema>;
export type PolicySnapshotCommand = z.infer<typeof requestSchema>;
export type PolicyBookingBinding = z.infer<typeof bindingSchema>;
export interface PolicySnapshotOptions {
  client: mongo.MongoClient; database: string; namespace: string; keys: StorageKeys;
  clock(): string;
  tokens: ITokenService; accounts: AccountDirectory; memberships: MembershipDirectory;
  loadPermissions(): Promise<unknown>;
  configuration: PolicySnapshotConfiguration;
  /** Authoritative server lookup; must enforce brand/module/tenant ownership and provenance. */
  resolveBooking(bookingId: string, principal: VerifiedPrincipal): Promise<unknown>;
  /** Trusted pure validator: checks the opaque body and its EXACT canonical metadata projection.
   * This must validate provenance/acceptance evidence; JSON equality cannot establish consent. */
  validateProducer(snapshot: Readonly<PolicySnapshot>): boolean;
}
export type PolicySnapshotResult = Readonly<{
  commandId: string; snapshot: Readonly<PolicySnapshot>; event: Readonly<z.infer<typeof eventSchema>>;
  receipt: Readonly<{ revision: number; eventId: string }>;
}>;
export interface PolicySnapshotStore {
  commit(token: string, input: PolicySnapshotCommand): Promise<PolicySnapshotResult>;
  read(token: string, bookingId: string): Promise<PolicySnapshotResult | null>;
}
function fail(code: ConstructorParameters<typeof FoundationStoreError>[0]): never { throw new FoundationStoreError(code); }
function freeze(value: unknown): void {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
}
function detach(value: unknown): unknown { return JSON.parse(canonicalJson(value)) as unknown; }
function consistent(request: PolicySnapshotCommand): boolean {
  const { snapshot: s, event: e } = request;
  return e.subject.booking_id === s.bookingId && (!e.subject.quote_id || e.subject.quote_id === s.quoteId) &&
    e.payload.booking_id === s.bookingId && e.payload.policy_id === s.policy.policy_id && e.payload.version === s.policy.version &&
    (!s.policy.partner_id || s.policy.partner_id === s.partnerId) && (!s.policy.quote_id || s.policy.quote_id === s.quoteId) &&
    canonicalJson(e.after) === canonicalJson(s.body);
}

/** Internal persistence seam only. No HTTP route, catalog defaults, booking or money state transition. */
export async function openPolicySnapshotStore(options: PolicySnapshotOptions): Promise<PolicySnapshotStore> {
  const config = configurationSchema.safeParse(options.configuration);
  if (!config.success || typeof options.resolveBooking !== 'function' || typeof options.validateProducer !== 'function' ||
      typeof options.loadPermissions !== 'function' || !options.accounts || !options.tokens || !options.memberships) fail('INVALID_REQUEST');
  const configuration = config.data;
  freeze(configuration);
  const { resolveBooking, validateProducer, loadPermissions, tokens, accounts, memberships, clock } = options;
  const common = {
    client: options.client, database: options.database, namespace: options.namespace, keys: options.keys, clock,
    schema: envelopeSchema, schemaVersion: 'policy-snapshot-envelope-v1', mode: 'append-only' as const,
    readAction: configuration.readAction, writeAction: configuration.writeAction, memberships,
    loadPolicy: loadPermissions, verifyIntegrity: true,
  };
  const snapshots = await openVersionedStore({ ...common, kind: 'policy-snapshot' });
  const eventClaims = await openVersionedStore({ ...common, schema: claimSchema, kind: 'policy-snapshot-event' });
  const transaction = await openRecordTransaction({
    ...common, policy: configuration.transaction,
    validate: (changes) => {
      if (changes.length !== 2 || changes.some((change) => change.before !== null)) return false;
      const snapshot = envelopeSchema.parse(changes.find((change) => change.kind === 'policy-snapshot')?.after);
      const reservation = claimSchema.parse(changes.find((change) => change.kind === 'policy-snapshot-event')?.after);
      return canonicalJson(claim(snapshot.request)) === canonicalJson(reservation);
    },
  });
  function claim(request: PolicySnapshotCommand): z.infer<typeof claimSchema> {
    return { format: 1, bookingId: request.snapshot.bookingId, eventId: request.event.event_id,
      snapshotId: request.snapshot.snapshotId, commandId: request.commandId };
  }
  async function identity(token: string) {
    const result = await resolvePrincipal(token, tokens, accounts);
    if (result.status !== 'authenticated') return fail(result.code === 'IDENTITY_UNAVAILABLE' ? 'IDENTITY_UNAVAILABLE' : 'AUTH_SCOPE_DENIED');
    return result.principal;
  }
  async function authorize(token: string, bookingId: string, action: 'booking.read' | 'booking.write') {
    const principal = await identity(token);
    let binding: PolicyBookingBinding;
    let permissions: z.infer<typeof permissionPolicySchema>;
    try {
      binding = bindingSchema.parse(detach(await resolveBooking(bookingId, principal)));
      permissions = permissionPolicySchema.parse(detach(await loadPermissions()));
    } catch { return fail('AUTH_SCOPE_DENIED'); }
    if (binding.bookingId !== bookingId) fail('AUTH_SCOPE_DENIED');
    let ts: string;
    try { ts = z.string().datetime({ offset: true }).parse(clock()); }
    catch { return fail('INVALID_REQUEST'); }
    const decision = await authorizeResource({ principal, resource: binding.scope, action, policy: permissions, now: ts }, memberships);
    if (!decision.authorized) return fail(decision.code);
    return { principal, binding, permissions };
  }
  function validate(request: PolicySnapshotCommand) {
    try { if (!consistent(request) || validateProducer(request.snapshot) !== true) fail('INVALID_RECORD'); }
    catch { return fail('INVALID_RECORD'); }
  }
  function result(payload: unknown, receipt: { revision: number; eventId: string }): PolicySnapshotResult {
    try {
      const saved = envelopeSchema.parse(detach(payload));
      freeze(saved);
      validate(saved.request);
      const output = { commandId: saved.request.commandId, snapshot: saved.request.snapshot, event: saved.request.event, receipt };
      freeze(output);
      return output;
    } catch { return fail('INTEGRITY_FAILURE'); }
  }
  return {
    async commit(token: string, input: PolicySnapshotCommand): Promise<PolicySnapshotResult> {
      let request: PolicySnapshotCommand;
      try { request = requestSchema.parse(detach(input)); freeze(request); }
      catch { return fail('INVALID_REQUEST'); }
      validate(request);
      const { principal, binding, permissions } = await authorize(token, request.snapshot.bookingId, configuration.writeAction);
      const s = request.snapshot;
      if (s.quoteId !== binding.quoteId || s.partnerId !== binding.partnerId || s.tenantId !== binding.tenantId ||
          s.contextId !== binding.contextId || request.event.actor_id !== principal.userId ||
          request.event.actor !== binding.eventActor || request.event.role !== binding.eventRole) fail('AUTH_SCOPE_DENIED');
      const payload = { format: 1, request, binding, configuration, permissions };
      const committed = await transaction.write(principal, {
        commandId: request.commandId, correlationId: request.correlationId,
        changes: [{ store: snapshots, id: s.bookingId, payload }, { store: eventClaims, id: request.event.event_id, payload: claim(request) }].map(({ store, id: recordId, payload: recordPayload }) => ({
          store, record: { id: recordId, expectedRevision: 0, createScope: binding.scope, payload: recordPayload },
        })),
      });
      const record = committed.records.find((row) => row.kind === 'policy-snapshot');
      if (!record) return fail('INTEGRITY_FAILURE');
      return result(record.payload, { revision: record.revision, eventId: record.eventId });
    },
    async read(token: string, bookingId: string): Promise<PolicySnapshotResult | null> {
      if (!id.safeParse(bookingId).success) fail('INVALID_REQUEST');
      const { principal, binding } = await authorize(token, bookingId, configuration.readAction);
      const first = await snapshots.read(principal, bookingId);
      if (!first) return null;
      let saved: z.infer<typeof envelopeSchema>;
      try { saved = envelopeSchema.parse(first.payload); }
      catch { return fail('INTEGRITY_FAILURE'); }
      if (canonicalJson(saved.binding) !== canonicalJson(binding) || saved.request.snapshot.bookingId !== bookingId) fail('AUTH_SCOPE_DENIED');
      const checked = await transaction.read(principal, [
        { store: snapshots, id: bookingId }, { store: eventClaims, id: saved.request.event.event_id },
      ], { commandId: saved.request.commandId, correlationId: saved.request.correlationId });
      if (checked.records.some((row) => !row.record || canonicalJson(row.record.payload) !==
          canonicalJson(row.kind === 'policy-snapshot' ? saved : claim(saved.request)))) fail('INTEGRITY_FAILURE');
      return result(saved, { revision: first.revision, eventId: first.eventId });
    },
  };
}
