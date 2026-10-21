import { z } from 'zod';
import type { ITokenService } from '../auth/auth.types';

// Local DEV-005 ports. No new API or database collection is mounted by this file.
// BRD9 §17/21: current server identity and resource scope, never browser role claims.
const id = z.string().min(1);
const time = z.string().datetime({ offset: true });
const scopeSchema = z
  .object({ kind: z.enum(['customer', 'organization', 'partner']), id })
  .strict();
const roleSchema = z.enum(['customer', 'organizer', 'sales', 'ops', 'admin', 'partner', 'adapter']);
const actionSchema = z.enum([
  'context.read',
  'context.write',
  'proposal.read',
  'proposal.write',
  'proposal.decide',
  'lead.read',
  'lead.write',
  'partner.read',
  'partner.write',
  'booking.read',
  'booking.write',
  'booking.respond',
  'configuration.write',
  'delivery.read',
  'delivery.retry',
  'delivery.history.read',
  'delivery.history.details',
]);
const accountSchema = z.object({ userId: id, active: z.boolean() }).strict();
const credentialSchema = z.object({ phone: z.string().refine((value) => value.trim().length > 0) });
const membershipSchema = z
  .object({
    membershipId: id,
    userId: id,
    scope: scopeSchema,
    role: roleSchema,
    active: z.boolean(),
    validFrom: time.nullable(),
    expiresAt: time.nullable(),
  })
  .strict()
  .refine(
    (value) =>
      value.validFrom === null ||
      value.expiresAt === null ||
      Date.parse(value.validFrom) < Date.parse(value.expiresAt),
  );
const membershipsSchema = z
  .array(membershipSchema)
  .refine((rows) => new Set(rows.map((row) => row.membershipId)).size === rows.length);

export const permissionPolicySchema = z
  .object({
    policyId: id,
    revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    grants: z.array(z.object({ action: actionSchema, roles: z.array(roleSchema) }).strict()),
  })
  .strict()
  .refine(
    (policy) => new Set(policy.grants.map((grant) => grant.action)).size === policy.grants.length,
  );

/** Empty configuration is intentionally incapable of granting a live action. */
export const disabledPermissionPolicy = Object.freeze({
  policyId: 'unconfigured',
  revision: 1,
  grants: Object.freeze([]),
});

export interface AccountDirectory {
  /** Resolve a cryptographically verified legacy token identifier to an active stable account. */
  findByTokenIdentifier(identifier: string): Promise<unknown>;
}
export interface MembershipDirectory {
  /** Current server records only: do not populate this port from token/body claims or browser state. */
  listForUser(userId: string): Promise<unknown>;
}

const verifiedPrincipal = Symbol('request-local-server-verified-principal');
export type VerifiedPrincipal = Readonly<{ userId: string; [verifiedPrincipal]: true }>;
export type IdentityResult =
  | { status: 'authenticated'; principal: VerifiedPrincipal }
  | { status: 'denied'; code: 'AUTHENTICATION_FAILED' | 'IDENTITY_UNAVAILABLE' };

/** Call for each request. This proves token/account identity, not phone OTP, membership or payment authority. */
export async function resolvePrincipal(
  token: string,
  tokens: ITokenService,
  accounts: AccountDirectory,
): Promise<IdentityResult> {
  let identifier: string;
  try {
    const claims = credentialSchema.safeParse(tokens.verify(token));
    if (!claims.success) return { status: 'denied', code: 'AUTHENTICATION_FAILED' };
    identifier = claims.data.phone;
  } catch {
    return { status: 'denied', code: 'AUTHENTICATION_FAILED' };
  }
  try {
    const account = accountSchema.safeParse(await accounts.findByTokenIdentifier(identifier));
    if (!account.success || !account.data.active)
      return { status: 'denied', code: 'AUTHENTICATION_FAILED' };
    const principal: VerifiedPrincipal = { userId: account.data.userId, [verifiedPrincipal]: true };
    return { status: 'authenticated', principal: Object.freeze(principal) };
  } catch {
    return { status: 'denied', code: 'IDENTITY_UNAVAILABLE' };
  }
}

function isPrincipal(value: unknown): value is VerifiedPrincipal {
  return (
    typeof value === 'object' &&
    value !== null &&
    verifiedPrincipal in value &&
    value[verifiedPrincipal] === true &&
    'userId' in value &&
    typeof value.userId === 'string'
  );
}

type Scope = z.infer<typeof scopeSchema>;
type Role = z.infer<typeof roleSchema>;
type Member = z.infer<typeof membershipSchema>;
export type ScopeDecision =
  | {
      authorized: true;
      actor: Readonly<{ userId: string; membershipId: string; role: Role; scope: Readonly<Scope> }>;
    }
  | {
      authorized: false;
      code: 'AUTH_SCOPE_DENIED' | 'POLICY_INVALID' | 'INVALID_REQUEST' | 'IDENTITY_UNAVAILABLE';
    };
export type ScopeRequest = {
  principal: unknown;
  resource: unknown;
  action: unknown;
  policy: unknown;
  now: unknown;
};

function compatibleRole(member: Member): boolean {
  if (member.role === 'customer')
    return member.scope.kind === 'customer' && member.scope.id === member.userId;
  if (member.role === 'organizer') return member.scope.kind === 'organization';
  if (member.role === 'partner' || member.role === 'adapter')
    return member.scope.kind === 'partner';
  return true; // Staff still require an exact scoped membership and configured action; never a wildcard.
}

/** Read-only decision over a SERVER-LOADED resource scope and current memberships.
 * Scope IDs are compared literally. Route adapters must load the resource before calling;
 * accepting its owner/scope from a request body would invalidate this boundary.
 * The policy is trusted server configuration; it is not supplied by the caller's HTTP body.
 */
export async function authorizeResource(
  request: ScopeRequest,
  directory: MembershipDirectory,
): Promise<ScopeDecision> {
  if (!isPrincipal(request.principal)) return { authorized: false, code: 'AUTH_SCOPE_DENIED' };
  const principal = request.principal;
  const resource = scopeSchema.safeParse(request.resource);
  const action = actionSchema.safeParse(request.action);
  const now = time.safeParse(request.now);
  if (!resource.success || !action.success || !now.success)
    return { authorized: false, code: 'INVALID_REQUEST' };
  const policy = permissionPolicySchema.safeParse(request.policy);
  if (!policy.success) return { authorized: false, code: 'POLICY_INVALID' };
  const grant = policy.data.grants.find((item) => item.action === action.data);
  if (!grant || grant.roles.length === 0) return { authorized: false, code: 'AUTH_SCOPE_DENIED' };
  if (resource.data.kind === 'customer' && resource.data.id !== principal.userId)
    return { authorized: false, code: 'AUTH_SCOPE_DENIED' };
  let rows: unknown;
  try {
    // Deliberately no cached or token-supplied role fallback when the server store is unavailable.
    rows = await directory.listForUser(principal.userId);
  } catch {
    return { authorized: false, code: 'IDENTITY_UNAVAILABLE' };
  }
  const memberships = membershipsSchema.safeParse(rows);
  if (!memberships.success) return { authorized: false, code: 'AUTH_SCOPE_DENIED' };
  const instant = Date.parse(now.data);
  const member = memberships.data.find(
    (item) =>
      item.userId === principal.userId &&
      item.active &&
      item.scope.kind === resource.data.kind &&
      item.scope.id === resource.data.id &&
      (item.validFrom === null || Date.parse(item.validFrom) <= instant) &&
      (item.expiresAt === null || instant < Date.parse(item.expiresAt)) &&
      compatibleRole(item) &&
      grant.roles.includes(item.role),
  );
  if (!member) return { authorized: false, code: 'AUTH_SCOPE_DENIED' };
  return {
    authorized: true,
    actor: Object.freeze({
      userId: principal.userId,
      membershipId: member.membershipId,
      role: member.role,
      scope: Object.freeze({ ...member.scope }),
    }),
  };
}
