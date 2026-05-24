import { Decimal } from "./vendor/decimal.js/decimal.mjs";
import {
  BaseMode,
  DEFAULT_FRACTION_DENOMINATOR,
  DISPLAY_SIGNIFICANT_DIGITS,
  DisplayMode,
  MAX_DISPLAY_DECIMAL_PLACES,
  RpnError,
  ZERO,
  approximateFraction,
  baseIntegerFromDecimal,
  toBaseWord,
  type DisplaySettings,
  type NumberValue,
} from "./calculator.js";

export function formatNumber(
  value: NumberValue,
  display: DisplaySettings = {
    mode: DisplayMode.All,
    digits: MAX_DISPLAY_DECIMAL_PLACES,
    fraction: { enabled: false, maxDenominator: DEFAULT_FRACTION_DENOMINATOR },
  },
  baseMode: BaseMode = BaseMode.Dec,
): string {
  if (baseMode !== BaseMode.Dec) return formatBaseInteger(value, baseMode);
  if (display.fraction.enabled) {
    return formatFraction(value, display.fraction.maxDenominator);
  }

  if (display.mode === DisplayMode.Fix) return formatFixed(value, display.digits);
  if (display.mode === DisplayMode.Sci) return formatScientific(value, display.digits);
  if (display.mode === DisplayMode.Eng) return formatEngineering(value, display.digits);
  return formatAll(value);
}

function formatFixed(value: NumberValue, digits: number): string {
  if (fixedWouldRoundToZero(value, digits) || fixedWouldExceedDisplay(value, digits)) {
    return formatScientific(value, digits);
  }

  const text = value.toFixed(digits);
  return text;
}

function formatAll(value: NumberValue): string {
  if (value.isZero()) return "0";
  const text = value.toSignificantDigits(DISPLAY_SIGNIFICANT_DIGITS).toString();
  if (text.includes("e")) {
    const [mantissa, exponent] = text.split("e");
    return `${stripTrailingDecimalZeros(mantissa ?? "0")}e${formatExponent(Number(exponent ?? 0))}`;
  }
  return stripTrailingDecimalZeros(text);
}

function formatScientific(value: NumberValue, digits: number): string {
  const text = value.toExponential(digits);
  const [mantissa, exponent] = text.split("e");
  return `${mantissa ?? "0"}e${formatExponent(Number(exponent ?? 0))}`;
}

function formatEngineering(value: NumberValue, digits: number): string {
  if (value.isZero()) return `${ZERO.toFixed(digits)}e+0`;

  const exponent = value.e;
  const engineeringExponent = exponent - modulo(exponent, 3);
  const mantissa = value.div(new Decimal(10).pow(engineeringExponent));
  return `${mantissa.toFixed(digits)}e${formatExponent(engineeringExponent)}`;
}

function fixedWouldRoundToZero(value: NumberValue, digits: number): boolean {
  return !value.isZero() && value.e < -digits;
}

function fixedWouldExceedDisplay(value: NumberValue, digits: number): boolean {
  return value.e >= 0 && value.e + 1 + digits > DISPLAY_SIGNIFICANT_DIGITS;
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function formatExponent(exponent: number): string {
  return exponent >= 0 ? `+${exponent}` : `${exponent}`;
}

function stripTrailingDecimalZeros(text: string): string {
  if (!text.includes(".")) return text;
  return text.replace(/0+$/, "").replace(/\.$/, "");
}

export function formatStack(
  stack: readonly NumberValue[],
  display: DisplaySettings = {
    mode: DisplayMode.All,
    digits: MAX_DISPLAY_DECIMAL_PLACES,
    fraction: { enabled: false, maxDenominator: DEFAULT_FRACTION_DENOMINATOR },
  },
  options: { baseMode?: BaseMode; full?: boolean } = {},
): string {
  if (stack.length !== 4) throw new RpnError("expected a four-level stack: T Z Y X");

  const baseMode = options.baseMode ?? BaseMode.Dec;
  if (options.full !== true) return formatNumber(stack[3] ?? ZERO, display, baseMode);

  const labels = ["T", "Z", "Y", "X"];
  return stack
    .map((value, index) => `${labels[index]}: ${formatNumber(value, display, baseMode)}`)
    .join("  ");
}

function formatFraction(value: NumberValue, maxDenominator: number): string {
  if (value.isZero()) return "0";
  if (!value.isFinite()) return formatAll(value);

  const sign = value.isNegative() ? "-" : "";
  const absolute = value.abs();
  const integerPart = absolute.trunc();
  const fractionPart = absolute.minus(integerPart);
  if (fractionPart.isZero()) return `${sign}${integerPart.toFixed(0)}`;

  const [numerator, denominator] = approximateFraction(fractionPart, maxDenominator);
  if (numerator === 0n) return `${sign}${integerPart.toFixed(0)}`;

  const integer = BigInt(integerPart.toFixed(0));
  if (numerator === denominator) return `${sign}${integer + 1n}`;
  if (integer === 0n) return `${sign}${numerator}/${denominator}`;
  return `${sign}${integer} ${numerator}/${denominator}`;
}

function formatBaseInteger(value: NumberValue, baseMode: BaseMode): string {
  const integer = baseIntegerFromDecimal(value);
  if (integer === undefined) return "Too Big";

  const radix = radixFor(baseMode);
  return toBaseWord(integer).toString(radix).toUpperCase();
}

function radixFor(baseMode: BaseMode): number {
  switch (baseMode) {
    case BaseMode.Hex:
      return 16;
    case BaseMode.Oct:
      return 8;
    case BaseMode.Bin:
      return 2;
    case BaseMode.Dec:
      return 10;
  }
}
