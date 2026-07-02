import { describe, it, expect } from 'vitest';
import { PASSWORD_RULES, isStrongPassword } from './password';

describe('isStrongPassword', () => {
  it('accepts passwords meeting all rules', () => {
    expect(isStrongPassword('Elate@2026')).toBe(true);
    expect(isStrongPassword('Str0ng!Pass')).toBe(true);
  });

  it('rejects passwords shorter than 8 or longer than 32 characters', () => {
    expect(isStrongPassword('Ab1@xyz')).toBe(false);
    expect(isStrongPassword('Ab1@' + 'x'.repeat(30))).toBe(false);
  });

  it('requires an uppercase letter', () => {
    expect(isStrongPassword('elate@2026')).toBe(false);
  });

  it('requires a lowercase letter', () => {
    expect(isStrongPassword('ELATE@2026')).toBe(false);
  });

  it('requires a digit', () => {
    expect(isStrongPassword('Elate@trip')).toBe(false);
  });

  it('requires a special character', () => {
    expect(isStrongPassword('Elate2026x')).toBe(false);
  });

  it('exposes one rule per requirement for the checklist UI', () => {
    expect(PASSWORD_RULES.map((r) => r.id)).toEqual([
      'length',
      'upper',
      'lower',
      'digit',
      'special',
    ]);
  });
});
