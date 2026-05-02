import { Decimal } from "decimal.js";
import { RpnError } from "./errors.js";
import type { NumberValue } from "./numbers.js";

export type UnaryOp = (x: NumberValue) => NumberValue;
export type BinaryOp = (a: NumberValue, b: NumberValue) => NumberValue;

export function decimalPower(a: NumberValue, b: NumberValue): NumberValue {
  if (b.isInteger()) return a.pow(b.toNumber());
  return Decimal.pow(a, b);
}

export function factorial(value: NumberValue): NumberValue {
  if (!value.isInteger() || value.isNegative()) {
    throw new RpnError("factorial requires a non-negative integer");
  }

  let result = new Decimal(1);
  for (let factor = 2; factor <= value.toNumber(); factor += 1) {
    result = result.times(factor);
  }
  return result;
}
