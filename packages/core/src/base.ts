import { Decimal } from "./vendor/decimal.js/decimal.mjs";
import { BaseMode, RpnError, type BinaryOp, type NumberValue } from "./calculator.js";

export const BASE_MIN_INTEGER = new Decimal("-34359738368");
export const BASE_MAX_INTEGER = new Decimal("34359738367");

const BASE_WORD_BITS = 36n;
const BASE_UNSIGNED_LIMIT = 1n << BASE_WORD_BITS;
const BASE_SIGN_BIT = 1n << (BASE_WORD_BITS - 1n);
const BASE_MIN_BIGINT = -(1n << (BASE_WORD_BITS - 1n));
const BASE_MAX_BIGINT = (1n << (BASE_WORD_BITS - 1n)) - 1n;

export function parseBaseInteger(token: string, baseMode: BaseMode): NumberValue | undefined {
  const spec = baseSpec(baseMode);
  if (spec === undefined) return undefined;
  const normalized = token.trim();
  const isNegative = normalized.startsWith("-");
  const digits = /^[+-]/.test(normalized) ? normalized.slice(1) : normalized;
  if (digits === "" || !spec.digits.test(digits)) return undefined;
  if (digits.length > spec.maxDigits) throw new RpnError("base input exceeds 36-bit word size");

  let result = 0n;
  for (const digit of digits.toLowerCase()) {
    result = result * BigInt(spec.radix) + BigInt(Number.parseInt(digit, spec.radix));
  }
  if (!isNegative && result >= BASE_UNSIGNED_LIMIT) {
    throw new RpnError("base input exceeds 36-bit word size");
  }
  const signedResult = isNegative ? -result : fromBaseWord(result);
  if (signedResult < BASE_MIN_BIGINT || signedResult > BASE_MAX_BIGINT) {
    throw new RpnError("base input exceeds 36-bit word size");
  }
  return new Decimal(signedResult.toString());
}

export function baseIntegerFromDecimal(value: NumberValue): bigint | undefined {
  const integer = value.trunc();
  if (integer.lt(BASE_MIN_INTEGER) || integer.gt(BASE_MAX_INTEGER)) return undefined;
  return BigInt(integer.toFixed(0));
}

export function requireBaseInteger(value: NumberValue): bigint {
  const integer = baseIntegerFromDecimal(value);
  if (integer === undefined) throw new RpnError("base operation exceeds 36-bit word size");
  return integer;
}

export function clampBaseInteger(value: bigint): bigint {
  if (value < BASE_MIN_BIGINT) return BASE_MIN_BIGINT;
  if (value > BASE_MAX_BIGINT) return BASE_MAX_BIGINT;
  return value;
}

export function toBaseWord(value: bigint): bigint {
  return value < 0n ? value + BASE_UNSIGNED_LIMIT : value;
}

export function baseBinaryOp(op: (a: bigint, b: bigint) => bigint): BinaryOp {
  return (a, b) =>
    new Decimal(clampBaseInteger(op(requireBaseInteger(a), requireBaseInteger(b))).toString());
}

export function baseDivide(a: NumberValue, b: NumberValue): NumberValue {
  const divisor = requireBaseInteger(b);
  if (divisor === 0n) throw new RpnError("invalid operation (divide by zero)");
  return new Decimal(clampBaseInteger(requireBaseInteger(a) / divisor).toString());
}

export function baseModulo(a: NumberValue, b: NumberValue): NumberValue {
  const divisor = requireBaseInteger(b);
  if (divisor === 0n) throw new RpnError("invalid operation (divide by zero)");
  return new Decimal(clampBaseInteger(requireBaseInteger(a) % divisor).toString());
}

function fromBaseWord(value: bigint): bigint {
  return value >= BASE_SIGN_BIT ? value - BASE_UNSIGNED_LIMIT : value;
}

function baseSpec(baseMode: BaseMode) {
  switch (baseMode) {
    case BaseMode.Hex:
      return { digits: /^[0-9a-f]+$/i, maxDigits: 9, radix: 16 };
    case BaseMode.Oct:
      return { digits: /^[0-7]+$/, maxDigits: 12, radix: 8 };
    case BaseMode.Bin:
      return { digits: /^[01]+$/, maxDigits: 36, radix: 2 };
    case BaseMode.Dec:
      return undefined;
  }
}
