import { Decimal } from "./vendor/decimal.js/decimal.mjs";
import { RpnError, ZERO, type NumberValue } from "./calculator.js";

const FRACTION_NUMBER_TOKEN = /^([+-]?)(?:(\d+)\.(\d+)\.(\d+)|(\d+)\.\.(\d+))$/;

export interface FractionDecomposition {
  negative: boolean;
  integer: bigint;
  numerator: bigint;
  denominator: bigint;
}

export function parseFraction(token: string): NumberValue | undefined {
  const match = token.match(FRACTION_NUMBER_TOKEN);
  if (!match) return undefined;
  const [
    ,
    sign = "",
    mixedInteger = "",
    mixedNumerator = "",
    mixedDenominator = "",
    numerator = "",
    denominator = "",
  ] = match;
  const integerDigits = mixedInteger.length;
  const numeratorDigits = (mixedNumerator || numerator).length;
  const denominatorDigits = mixedDenominator || denominator;
  if (integerDigits + numeratorDigits > 12) {
    throw new RpnError("fraction integer and numerator must not exceed 12 digits total");
  }
  if (denominatorDigits.length > 4) {
    throw new RpnError("fraction denominator must not exceed 4 digits");
  }
  const denominatorValue = new Decimal(denominatorDigits);
  if (denominatorValue.isZero()) throw new RpnError("fraction denominator must not be zero");
  const magnitude = new Decimal(mixedInteger || 0).plus(
    new Decimal(mixedNumerator || numerator).div(denominatorValue),
  );
  return sign === "-" ? magnitude.neg() : magnitude;
}

export function approximateFraction(value: NumberValue, maxDenominator: number): [bigint, bigint] {
  const limit = Math.max(1, maxDenominator);
  let bestNumerator = 0n;
  let bestDenominator = 1n;
  let bestError: Decimal | undefined;
  for (let denominator = 1; denominator <= limit; denominator += 1) {
    const numerator = value.times(denominator).round();
    const error = value.minus(numerator.div(denominator)).abs();
    if (
      bestError === undefined ||
      error.lt(bestError) ||
      (error.eq(bestError) && denominator < Number(bestDenominator))
    ) {
      bestError = error;
      bestNumerator = BigInt(numerator.toFixed(0));
      bestDenominator = BigInt(denominator);
      if (error.isZero()) break;
    }
  }
  const divisor = gcd(bestNumerator, bestDenominator);
  return [bestNumerator / divisor, bestDenominator / divisor];
}

export function decomposeFraction(
  value: NumberValue,
  maxDenominator: number,
): FractionDecomposition {
  const absolute = value.abs();
  let integer = BigInt(absolute.trunc().toFixed(0));
  let [numerator, denominator] = approximateFraction(
    absolute.minus(absolute.trunc()),
    maxDenominator,
  );
  if (numerator >= denominator) {
    integer += numerator / denominator;
    numerator %= denominator;
  }
  return { negative: value.isNegative(), integer, numerator, denominator };
}

export function reconstructFraction(parts: FractionDecomposition): NumberValue {
  if (parts.integer === 0n && parts.numerator === 0n) return ZERO;
  const magnitude = new Decimal(parts.integer.toString()).plus(
    new Decimal(parts.numerator.toString()).div(parts.denominator.toString()),
  );
  return parts.negative ? magnitude.neg() : magnitude;
}

function gcd(a: bigint, b: bigint): bigint {
  let left = a < 0n ? -a : a;
  let right = b < 0n ? -b : b;
  while (right !== 0n) [left, right] = [right, left % right];
  return left === 0n ? 1n : left;
}
