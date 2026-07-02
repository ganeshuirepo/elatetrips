/**
 * Password policy shared by the signup and reset-password forms — mirrors the
 * backend rules in elatetrips-node/src/modules/auth/auth.validation.ts (keep
 * in sync). Modelled on common travel-app policies (e.g. MakeMyTrip): 8–32
 * chars with upper, lower, digit and special characters.
 */

export interface PasswordRule {
  id: string;
  label: string;
  test: (password: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  { id: 'length', label: '8–32 characters', test: (p) => p.length >= 8 && p.length <= 32 },
  { id: 'upper', label: 'One uppercase letter (A–Z)', test: (p) => /[A-Z]/.test(p) },
  { id: 'lower', label: 'One lowercase letter (a–z)', test: (p) => /[a-z]/.test(p) },
  { id: 'digit', label: 'One number (0–9)', test: (p) => /\d/.test(p) },
  { id: 'special', label: 'One special character (!@#$…)', test: (p) => /[^A-Za-z0-9]/.test(p) },
];

export const isStrongPassword = (password: string): boolean =>
  PASSWORD_RULES.every((rule) => rule.test(password));
