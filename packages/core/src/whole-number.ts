/**
 * The value of a string of digits, or 0 for anything else (blank, signed,
 * decimal, text). Number() of a huge digit string is still above any cap
 * (Infinity at worst), so callers need no separate length check.
 */
export function wholeNumber(raw: string): number {
  const text = raw.trim();
  return /^\d+$/.test(text) ? Number(text) : 0;
}
