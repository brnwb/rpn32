import { Decimal } from "decimal.js";

// The HP 32SII displays 12 significant digits and keeps a few guard digits
// internally. This is not a perfect emulation, but Decimal gets us much closer
// than JavaScript's binary floating point for calculator-style arithmetic.
export const WORKING_PRECISION = 15;

Decimal.set({ precision: WORKING_PRECISION, rounding: Decimal.ROUND_HALF_UP });

export type NumberValue = Decimal;

export const PI = new Decimal("3.14159265358979");
export const E = new Decimal("2.71828182845905");
export const ZERO = new Decimal(0);

export function parseDecimal(token: string): NumberValue | undefined {
  try {
    const value = new Decimal(token);
    return value.isFinite() ? value : undefined;
  } catch {
    return undefined;
  }
}
