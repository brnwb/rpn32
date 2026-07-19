import { Decimal } from "./vendor/decimal.js/decimal.mjs";
import {
  BaseMode,
  DEFAULT_FRACTION_DENOMINATOR,
  DISPLAY_SIGNIFICANT_DIGITS,
  DisplayMode,
  MAX_DISPLAY_DECIMAL_PLACES,
  RpnError,
  ZERO,
  type DisplaySettings,
  type NumberValue,
} from "./calculator.js";
import { baseIntegerFromDecimal, toBaseWord } from "./base.js";
import { decomposeFraction, reconstructFraction } from "./fraction.js";

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
  if (!value.isFinite()) return value.toString();

  const rounded = value.toSignificantDigits(DISPLAY_SIGNIFICANT_DIGITS);
  const significantDigits = rounded.sd();
  const ordinaryDigits =
    rounded.e >= 0 ? Math.max(rounded.e + 1, significantDigits) : significantDigits - rounded.e;
  if (ordinaryDigits <= DISPLAY_SIGNIFICANT_DIGITS) {
    return stripTrailingDecimalZeros(rounded.toFixed());
  }

  const [mantissa, exponent] = rounded.toExponential().split("e");
  return `${stripTrailingDecimalZeros(mantissa ?? "0")}e${formatExponent(Number(exponent ?? 0))}`;
}

function formatScientific(value: NumberValue, digits: number): string {
  const text = value.toExponential(digits);
  const [mantissa, exponent] = text.split("e");
  return `${mantissa ?? "0"}e${formatExponent(Number(exponent ?? 0))}`;
}

function formatEngineering(value: NumberValue, digits: number): string {
  if (value.isZero()) return `${ZERO.toFixed(digits)}e+0`;

  const rounded = value.toSignificantDigits(digits + 1);
  const exponent = rounded.e;
  const engineeringExponent = exponent - modulo(exponent, 3);
  const mantissa = rounded.div(new Decimal(10).pow(engineeringExponent));
  const decimalPlaces = Math.max(0, digits - mantissa.e);
  return `${mantissa.toFixed(decimalPlaces)}e${formatExponent(engineeringExponent)}`;
}

function fixedWouldRoundToZero(value: NumberValue, digits: number): boolean {
  return !value.isZero() && value.toDecimalPlaces(digits).isZero();
}

function fixedWouldExceedDisplay(value: NumberValue, digits: number): boolean {
  const rounded = value.toDecimalPlaces(digits);
  return rounded.e >= 0 && rounded.e + 1 + digits > DISPLAY_SIGNIFICANT_DIGITS;
}

export function roundToDisplay(value: NumberValue, display: DisplaySettings): NumberValue {
  if (display.fraction.enabled) {
    return reconstructFraction(decomposeFraction(value, display.fraction.maxDenominator));
  }
  switch (display.mode) {
    case DisplayMode.Fix:
      return value.toDecimalPlaces(display.digits);
    case DisplayMode.Sci:
    case DisplayMode.Eng:
      return value.toSignificantDigits(display.digits + 1);
    case DisplayMode.All:
      return value.toSignificantDigits(DISPLAY_SIGNIFICANT_DIGITS);
  }
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

  const parts = decomposeFraction(value, maxDenominator);
  const { negative, integer, numerator, denominator } = parts;
  const comparison = compareDecimalToFraction(value.abs(), integer, numerator, denominator);
  const indicator = comparison === 0 ? "" : comparison < 0 ? "↓ " : "↑ ";
  const sign = negative && (integer !== 0n || numerator !== 0n) ? "-" : "";
  if (numerator === 0n) return `${indicator}${sign}${integer}`;
  if (integer === 0n) return `${indicator}${sign}${numerator}/${denominator}`;
  return `${indicator}${sign}${integer} ${numerator}/${denominator}`;
}

function compareDecimalToFraction(
  value: NumberValue,
  integer: bigint,
  numerator: bigint,
  denominator: bigint,
): number {
  const [mantissa = "0", rawExponent = "0"] = value.toExponential().split("e");
  const coefficientText = mantissa.replace(".", "");
  const decimalExponent = Number(rawExponent) - coefficientText.length + 1;
  const decimalCoefficient = BigInt(coefficientText) * denominator;
  const fractionCoefficient = integer * denominator + numerator;

  if (decimalCoefficient === 0n || fractionCoefficient === 0n) {
    return decimalCoefficient === fractionCoefficient ? 0 : decimalCoefficient === 0n ? -1 : 1;
  }

  const decimalDigits = decimalCoefficient.toString().length + Math.max(0, decimalExponent);
  const fractionDigits = fractionCoefficient.toString().length + Math.max(0, -decimalExponent);
  if (decimalDigits !== fractionDigits) return decimalDigits < fractionDigits ? -1 : 1;

  const decimalScaled =
    decimalExponent > 0 ? decimalCoefficient * 10n ** BigInt(decimalExponent) : decimalCoefficient;
  const fractionScaled =
    decimalExponent < 0
      ? fractionCoefficient * 10n ** BigInt(-decimalExponent)
      : fractionCoefficient;
  return decimalScaled === fractionScaled ? 0 : decimalScaled < fractionScaled ? -1 : 1;
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
