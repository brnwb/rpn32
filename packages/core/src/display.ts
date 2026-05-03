import { Decimal } from "decimal.js";
import {
  DISPLAY_SIGNIFICANT_DIGITS,
  DisplayMode,
  MAX_DISPLAY_DECIMAL_PLACES,
  RpnError,
  ZERO,
  type DisplaySettings,
  type NumberValue,
} from "./calculator.js";

export function formatNumber(
  value: NumberValue,
  display: DisplaySettings = { mode: DisplayMode.All, digits: MAX_DISPLAY_DECIMAL_PLACES },
): string {
  if (display.mode === DisplayMode.Fix) return formatFixed(value, display.digits);
  if (display.mode === DisplayMode.Sci) return formatScientific(value, display.digits);
  if (display.mode === DisplayMode.Eng) return formatEngineering(value, display.digits);
  return formatAll(value);
}

function formatFixed(value: NumberValue, digits: number): string {
  const text = value.toFixed(digits);
  const rounded = new Decimal(text);
  const digitCount = text.replace("-", "").replace(".", "").length;
  if ((!value.isZero() && rounded.isZero()) || digitCount > DISPLAY_SIGNIFICANT_DIGITS) {
    return formatScientific(value, digits);
  }
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

  const exponent = value.abs().logarithm(10).floor().toNumber();
  const engineeringExponent = exponent - modulo(exponent, 3);
  const mantissa = value.div(new Decimal(10).pow(engineeringExponent));
  return `${mantissa.toFixed(digits)}e${formatExponent(engineeringExponent)}`;
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
  display: DisplaySettings = { mode: DisplayMode.All, digits: MAX_DISPLAY_DECIMAL_PLACES },
  options: { full?: boolean } = {},
): string {
  if (stack.length !== 4) throw new RpnError("expected a four-level stack: T Z Y X");

  if (options.full !== true) return formatNumber(stack[3] ?? ZERO, display);

  const labels = ["T", "Z", "Y", "X"];
  return stack
    .map((value, index) => `${labels[index]}: ${formatNumber(value, display)}`)
    .join("  ");
}
