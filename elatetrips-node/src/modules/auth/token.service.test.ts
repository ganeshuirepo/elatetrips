import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '../../common/errors/AppError';
import { env } from '../../config/env';
import { JwtTokenService } from './token.service';

const service = new JwtTokenService();
const phone = 'fixture-customer@example.invalid';
const sign = (claims: Record<string, unknown>) =>
  jwt.sign(claims, env.jwtSecret, { expiresIn: 60 });

describe('DEV-005 user credential boundary', () => {
  it('round-trips existing user credentials without changing the identifier', () => {
    assert.deepEqual(service.verify(service.sign({ phone })), { phone });
  });

  for (const value of [null, 42, true, {}, ['customer'], '', '   ']) {
    it(`rejects a malformed phone claim: ${JSON.stringify(value)}`, () => {
      assert.throws(() => service.verify(sign({ phone: value })), UnauthorizedError);
    });
  }

  for (const scope of ['console', 'partner-card', 'refresh']) {
    it(`rejects a credential explicitly belonging to the ${scope} adapter`, () => {
      assert.throws(() => service.verify(sign({ phone, scope })), UnauthorizedError);
    });
  }

  it('does not turn token role claims into a server authorization role', () => {
    assert.deepEqual(
      service.verify(sign({ phone, role: 'admin', organizationId: 'another-organization' })),
      { phone },
    );
  });

  it('rejects expired, incorrectly signed and malformed tokens', () => {
    assert.throws(
      () => service.verify(jwt.sign({ phone }, env.jwtSecret, { expiresIn: -1 })),
      UnauthorizedError,
    );
    assert.throws(
      () => service.verify(jwt.sign({ phone }, 'fixture-other-key')),
      UnauthorizedError,
    );
    assert.throws(() => service.verify('not-a-token'), UnauthorizedError);
  });

  it('accepts only the algorithm used by this user-token signer', () => {
    assert.throws(
      () =>
        service.verify(jwt.sign({ phone }, env.jwtSecret, { algorithm: 'HS384', expiresIn: 60 })),
      UnauthorizedError,
    );
  });
});
