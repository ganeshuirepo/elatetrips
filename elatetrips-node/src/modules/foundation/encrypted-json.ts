import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { z } from 'zod';

/** Technical storage format only; not a shared domain/API contract. */
const envelopeSchema = z
  .object({
    keyId: z.string().min(1),
    iv: z.string().regex(/^[a-f0-9]{24}$/),
    tag: z.string().regex(/^[a-f0-9]{32}$/),
    ciphertext: z.string().regex(/^(?:[a-f0-9]{2})*$/),
  })
  .strict();
export type EncryptedJson = z.infer<typeof envelopeSchema>;

/** Stable JSON rejects lossy values before storage or idempotency comparison. */
export function canonicalJson(value: unknown, ancestors = new Set<object>()): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (typeof value !== 'object' || value === null || ancestors.has(value))
    throw Error('Invalid JSON value');
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    throw Error('Invalid JSON object');
  if (Object.getOwnPropertySymbols(value).length) throw Error('Invalid JSON keys');
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      // Sparse arrays would silently turn missing values into null in JSON.stringify.
      if (Object.keys(value).length !== value.length) throw Error('Invalid JSON array');
      return `[${value.map((item: unknown) => canonicalJson(item, ancestors)).join(',')}]`;
    }
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key], ancestors)}`)
      .join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

export interface StorageKeys {
  activeKeyId: string;
  /** AES-256 keys from server secret management, including retained read keys. */
  encryptionKeys: ReadonlyMap<string, Buffer>;
  /** Stable, separate HMAC key. Rotate with an explicit receipt migration. */
  fingerprintKey: Buffer;
}

export function createJsonProtection(config: StorageKeys) {
  if (
    !config.activeKeyId ||
    config.encryptionKeys.size === 0 ||
    !config.encryptionKeys.has(config.activeKeyId) ||
    config.fingerprintKey.length !== 32 ||
    [...config.encryptionKeys.values()].some((key) => key.length !== 32)
  )
    throw Error('Invalid storage keys');
  // Caller mutation cannot change live keys halfway through a transaction.
  const keys = new Map([...config.encryptionKeys].map(([id, key]) => [id, Buffer.from(key)]));
  const activeKeyId = config.activeKeyId;
  const fingerprintKey = Buffer.from(config.fingerprintKey);
  return {
    fingerprint(value: unknown): string {
      return createHmac('sha256', fingerprintKey).update(canonicalJson(value)).digest('hex');
    },
    seal(value: unknown, binding: string): EncryptedJson {
      const key = keys.get(activeKeyId);
      if (!key) throw Error('Storage key unavailable');
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(Buffer.from(canonicalJson({ binding, keyId: activeKeyId })));
      const encrypted = Buffer.concat([
        cipher.update(canonicalJson(value), 'utf8'),
        cipher.final(),
      ]);
      return {
        keyId: activeKeyId,
        iv: iv.toString('hex'),
        tag: cipher.getAuthTag().toString('hex'),
        ciphertext: encrypted.toString('hex'),
      };
    },
    open(envelope: unknown, binding: string): unknown {
      const value = envelopeSchema.parse(envelope);
      const key = keys.get(value.keyId);
      if (!key) throw Error('Storage key unavailable');
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(value.iv, 'hex'));
      decipher.setAAD(Buffer.from(canonicalJson({ binding, keyId: value.keyId })));
      decipher.setAuthTag(Buffer.from(value.tag, 'hex'));
      const plain = Buffer.concat([
        decipher.update(Buffer.from(value.ciphertext, 'hex')),
        decipher.final(),
      ]);
      return JSON.parse(plain.toString('utf8')) as unknown;
    },
  };
}
