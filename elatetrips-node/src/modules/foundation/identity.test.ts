import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import type { ITokenService } from '../auth/auth.types';
import {
  authorizeResource,
  disabledPermissionPolicy,
  resolvePrincipal,
  type VerifiedPrincipal,
} from './identity';

const now = '2026-10-21T12:00:00Z';
const tokens: ITokenService = {
  sign: () => 'unused',
  verify: () => ({ phone: 'fixture-identifier' }),
};
const policy = {
  policyId: 'fixture-policy',
  revision: 1,
  grants: [
    {
      action: 'context.read',
      roles: ['customer', 'organizer', 'sales', 'ops', 'admin', 'partner', 'adapter'],
    },
  ],
};
const scope = { kind: 'organization', id: 'organization-a' };
const membership = () => ({
  membershipId: 'member-a',
  userId: 'user-a',
  role: 'organizer',
  scope: { ...scope },
  active: true,
  validFrom: null,
  expiresAt: null,
});
async function principal(): Promise<VerifiedPrincipal> {
  const result = await resolvePrincipal('fixture-token', tokens, {
    findByTokenIdentifier: async () => ({ userId: 'user-a', active: true }),
  });
  if (result.status !== 'authenticated')
    throw Error('Expected the fixture account to authenticate');
  return result.principal;
}

describe('DEV-005 server identity resolution', () => {
  it('resolves the verified legacy identifier to a stable active server account', async () => {
    let received: string | undefined;
    const result = await resolvePrincipal('fixture-token', tokens, {
      findByTokenIdentifier: async (identifier) => {
        received = identifier;
        return { userId: 'stable-user-id', active: true };
      },
    });
    assert.equal(received, 'fixture-identifier');
    assert.equal(result.status, 'authenticated');
    if (result.status === 'authenticated') {
      assert.equal(result.principal.userId, 'stable-user-id');
      assert.equal(Object.isFrozen(result.principal), true);
      assert.equal('phone' in result.principal, false);
    }
  });

  for (const account of [
    null,
    {},
    { userId: 'user-a', active: false },
    { userId: 'user-a', active: true, browserRole: 'admin' },
  ]) {
    it(`denies missing/inactive/invalid account data: ${JSON.stringify(account)}`, async () => {
      assert.deepEqual(
        await resolvePrincipal('token', tokens, { findByTokenIdentifier: async () => account }),
        { status: 'denied', code: 'AUTHENTICATION_FAILED' },
      );
    });
  }

  it('does not query accounts after an invalid credential', async () => {
    let queries = 0;
    const result = await resolvePrincipal(
      'invalid',
      {
        ...tokens,
        verify: () => {
          throw Error('private adapter failure');
        },
      },
      {
        findByTokenIdentifier: async () => {
          queries++;
          return null;
        },
      },
    );
    assert.equal(queries, 0);
    assert.deepEqual(result, { status: 'denied', code: 'AUTHENTICATION_FAILED' });
  });

  it('fails closed on account storage failure without echoing its error', async () => {
    assert.deepEqual(
      await resolvePrincipal('token', tokens, {
        findByTokenIdentifier: async () => {
          throw Error('sensitive database details');
        },
      }),
      { status: 'denied', code: 'IDENTITY_UNAVAILABLE' },
    );
  });
});

describe('DEV-005 resource authorization', () => {
  it('uses current server membership and returns only its exact scoped actor', async () => {
    const current = await principal();
    let lookedUp: string | undefined;
    const result = await authorizeResource(
      { principal: current, resource: scope, action: 'context.read', policy, now },
      {
        listForUser: async (userId) => {
          lookedUp = userId;
          return [membership()];
        },
      },
    );
    assert.equal(lookedUp, 'user-a');
    assert.deepEqual(result, {
      authorized: true,
      actor: { userId: 'user-a', membershipId: 'member-a', role: 'organizer', scope },
    });
  });

  for (const role of ['customer', 'organizer', 'sales', 'ops', 'admin', 'partner', 'adapter']) {
    it(`requires explicit configured membership for role ${role}`, async () => {
      const resource =
        role === 'customer'
          ? { kind: 'customer', id: 'user-a' }
          : role === 'partner' || role === 'adapter'
            ? { kind: 'partner', id: 'partner-a' }
            : scope;
      const result = await authorizeResource(
        { principal: await principal(), resource, action: 'context.read', policy, now },
        {
          listForUser: async () => [{ ...membership(), scope: resource, role }],
        },
      );
      assert.equal(result.authorized, true);
    });
  }

  it('denies empty default permission configuration', async () => {
    let queries = 0;
    const result = await authorizeResource(
      {
        principal: await principal(),
        resource: scope,
        action: 'context.read',
        policy: disabledPermissionPolicy,
        now,
      },
      {
        listForUser: async () => {
          queries++;
          return [membership()];
        },
      },
    );
    assert.deepEqual(result, { authorized: false, code: 'AUTH_SCOPE_DENIED' });
    assert.equal(queries, 0);
  });

  for (const resource of [
    { kind: 'organization', id: 'organization-b' },
    { kind: 'partner', id: 'partner-b' },
    { kind: 'customer', id: 'user-b' },
  ]) {
    it(`denies cross-resource access to ${resource.kind}`, async () => {
      assert.deepEqual(
        await authorizeResource(
          { principal: await principal(), resource, action: 'context.read', policy, now },
          {
            listForUser: async () => [{ ...membership(), role: 'admin' }],
          },
        ),
        { authorized: false, code: 'AUTH_SCOPE_DENIED' },
      );
    });
  }

  it('does not interpret an admin wildcard as membership of another organization', async () => {
    assert.deepEqual(
      await authorizeResource(
        { principal: await principal(), resource: scope, action: 'context.read', policy, now },
        {
          listForUser: async () => [
            { ...membership(), role: 'admin', scope: { kind: 'organization', id: '*' } },
          ],
        },
      ),
      { authorized: false, code: 'AUTH_SCOPE_DENIED' },
    );
  });

  it('cannot deserialize or invent a verified principal from browser JSON', async () => {
    const current = await principal();
    for (const forged of [
      { userId: 'user-a', role: 'admin' },
      JSON.parse(JSON.stringify(current)),
    ]) {
      assert.deepEqual(
        await authorizeResource(
          { principal: forged, resource: scope, action: 'context.read', policy, now },
          {
            listForUser: async () => [membership()],
          },
        ),
        { authorized: false, code: 'AUTH_SCOPE_DENIED' },
      );
    }
  });

  for (const change of [
    { active: false },
    { userId: 'user-b' },
    { role: 'partner' },
    { validFrom: '2026-10-21T12:00:01Z', expiresAt: null },
    { validFrom: null, expiresAt: now },
  ]) {
    it(`rejects inactive, foreign, incompatible or non-current membership: ${JSON.stringify(change)}`, async () => {
      assert.deepEqual(
        await authorizeResource(
          { principal: await principal(), resource: scope, action: 'context.read', policy, now },
          {
            listForUser: async () => [{ ...membership(), ...change }],
          },
        ),
        { authorized: false, code: 'AUTH_SCOPE_DENIED' },
      );
    });
  }

  it('observes membership revocation on the next check', async () => {
    const row = membership();
    const request = {
      principal: await principal(),
      resource: scope,
      action: 'context.read',
      policy,
      now,
    };
    const store = { listForUser: async () => [row] };
    assert.equal((await authorizeResource(request, store)).authorized, true);
    row.active = false;
    assert.equal((await authorizeResource(request, store)).authorized, false);
  });

  it('never falls back to a token role when membership storage is unavailable', async () => {
    assert.deepEqual(
      await authorizeResource(
        { principal: await principal(), resource: scope, action: 'context.read', policy, now },
        {
          listForUser: async () => {
            throw Error('private connection detail');
          },
        },
      ),
      { authorized: false, code: 'IDENTITY_UNAVAILABLE' },
    );
  });

  it('rejects malformed/ambiguous membership or permission records', async () => {
    const request = {
      principal: await principal(),
      resource: scope,
      action: 'context.read',
      policy,
      now,
    };
    for (const rows of [
      null,
      {},
      [{ ...membership(), role: 'Root' }],
      [membership(), membership()],
    ]) {
      assert.deepEqual(await authorizeResource(request, { listForUser: async () => rows }), {
        authorized: false,
        code: 'AUTH_SCOPE_DENIED',
      });
    }
    assert.deepEqual(
      await authorizeResource(
        { ...request, policy: { ...policy, grants: [...policy.grants, ...policy.grants] } },
        {
          listForUser: async () => [membership()],
        },
      ),
      { authorized: false, code: 'POLICY_INVALID' },
    );
  });

  it('rejects invalid time, unsupported financial actions and caller bypass fields', async () => {
    const request = {
      principal: await principal(),
      resource: scope,
      action: 'context.read',
      policy,
      now,
    };
    for (const change of [
      { now: 'invalid' },
      { action: 'payment.capture' },
      { resource: { ...scope, isAdmin: true } },
    ]) {
      assert.deepEqual(
        await authorizeResource(
          { ...request, ...change },
          { listForUser: async () => [membership()] },
        ),
        { authorized: false, code: 'INVALID_REQUEST' },
      );
    }
  });
});
