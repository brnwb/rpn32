import {
  BaseMode,
  DisplayMode,
  AngleMode,
  E,
  PI,
  CalculatorMachine,
  RpnError,
  MAX_DISPLAY_DECIMAL_PLACES,
  parseDecimal,
} from "./calculator.js";
import { parseBaseInteger } from "./base.js";
import { parseFraction } from "./fraction.js";
import { roundToDisplay } from "./display.js";
import {
  binaryOperations,
  percent,
  percentChange,
  polarToRectangular,
  rectangularToPolar,
  unaryOperations,
} from "./operations.js";

const DECIMAL_ONLY_OPERATIONS = new Set([
  "sqrt",
  "exp",
  "10^x",
  "alog",
  "ln",
  "^",
  "pow",
  "xroot",
  "1/x",
]);
const VARIABLE_ARITHMETIC_OPERATORS = new Set(["+", "-", "*", "/"]);

export function processLine(calc: CalculatorMachine, line: string): void {
  processTokens(calc, line.split(/\s+/).filter(Boolean));
}
export function processTokens(calc: CalculatorMachine, tokens: Iterable<string>): void {
  const list = Array.from(tokens);
  let i = 0;
  while (i < list.length) {
    const token = list[i]?.trim().toLowerCase() ?? "";
    if (token === "fix" || token === "sci" || token === "eng") {
      const next = list[i + 1];
      if (next === undefined) throw new RpnError(`${token} requires a digit count`);
      setDisplay(calc, token, next);
      i += 2;
    } else if (token === "frac") {
      const next = list[i + 1];
      if (next !== undefined && /^[+-]?\d+$/.test(next.trim())) {
        calc.setFractionDisplay(Number(next.trim()));
        i += 2;
      } else {
        calc.toggleFractionDisplay();
        i++;
      }
    } else if (token === "sto" || token === "rcl" || token === "view") {
      const next = list[i + 1];
      if (next === undefined) throw new RpnError(`${token} requires a variable name`);
      if ((token === "sto" || token === "rcl") && VARIABLE_ARITHMETIC_OPERATORS.has(next)) {
        const name = list[i + 2];
        if (name === undefined) throw new RpnError(`${token} ${next} requires a variable name`);
        const operation = binaryOperations(calc).get(next);
        if (operation === undefined) throw new RpnError(`unsupported variable arithmetic: ${next}`);
        if (token === "sto") calc.storeVariableArithmetic(name, operation);
        else calc.recallVariableArithmetic(name, operation);
        i += 3;
      } else {
        if (token === "sto") calc.storeVariable(next);
        else if (token === "rcl") calc.recallVariable(next);
        else calc.viewVariable(next);
        i += 2;
      }
    } else if (token === "x<>") {
      const next = list[i + 1];
      if (next === undefined) throw new RpnError("x<> requires a variable name");
      calc.exchangeVariable(next);
      i += 2;
    } else if (token === "clear" && list[i + 1]?.trim().toLowerCase() === "var") {
      calc.clearVariables();
      i += 2;
    } else if (token === "clear" && list[i + 1]?.trim().toLowerCase() === "all") {
      calc.clearAll();
      i += 2;
    } else {
      processToken(calc, token);
      i++;
    }
  }
}
export function processToken(calc: CalculatorMachine, token: string): void {
  token = token.trim().toLowerCase();
  if (!token) return;
  if (setBaseMode(calc, token)) return;
  const fraction = calc.baseMode === BaseMode.Dec ? parseFraction(token) : undefined;
  const value =
    calc.baseMode === BaseMode.Dec
      ? (fraction ?? parseDecimal(token))
      : parseBaseInteger(token, calc.baseMode);
  if (value !== undefined) {
    calc.pushNumber(value);
    return;
  }
  if (calc.baseMode !== BaseMode.Dec && DECIMAL_ONLY_OPERATIONS.has(token)) {
    throw new RpnError(`${token} is unavailable in ${calc.baseMode} mode`);
  }
  const binary = binaryOperations(calc).get(token);
  if (binary) {
    calc.applyBinary(binary);
    return;
  }
  const unary = unaryOperations(calc).get(token);
  if (unary) {
    calc.applyUnary(unary);
    return;
  }
  switch (token) {
    case "rnd":
    case "round":
      calc.applyUnary((x) => roundToDisplay(x, calc.display));
      return;
    case "chs":
    case "neg":
      calc.changeSign();
      return;
    case "enter":
    case "dup":
      calc.enter();
      return;
    case "drop":
      calc.drop();
      return;
    case "clx":
      calc.clearX();
      return;
    case "swap":
    case "xy":
      calc.swap();
      return;
    case "rdown":
    case "rdn":
      calc.rollDown();
      return;
    case "rup":
      calc.rollUp();
      return;
    case "clear":
      calc.clear();
      return;
    case "lastx":
      calc.recallLastX();
      return;
    case "all":
      calc.setDisplayMode(DisplayMode.All, calc.display.digits);
      return;
    case "vars":
      calc.listVariables();
      return;
    case "show":
      calc.show();
      return;
    case "%":
    case "pct":
      calc.applyBinaryPreservingY(percent);
      return;
    case "%chg":
    case "pctchg":
      calc.applyBinaryPreservingY(percentChange);
      return;
    case "r>p":
      calc.applyPair(rectangularToPolar(calc));
      return;
    case "p>r":
      calc.applyPair(polarToRectangular(calc));
      return;
    case "deg":
      calc.setAngleMode(AngleMode.Deg);
      return;
    case "rad":
      calc.setAngleMode(AngleMode.Rad);
      return;
    case "grad":
      calc.setAngleMode(AngleMode.Grad);
      return;
    case "pi":
      calc.pushNumber(PI);
      return;
    case "e":
      calc.pushNumber(E);
      return;
    default:
      throw new RpnError(`unknown token: ${JSON.stringify(token)}`);
  }
}
function setDisplay(calc: CalculatorMachine, mode: "fix" | "sci" | "eng", raw: string): void {
  const token = raw.trim();
  if (!/^[+-]?\d+$/.test(token))
    throw new RpnError(`display digit count must be an integer: ${JSON.stringify(raw)}`);
  const digits = Number(token);
  if (digits < 0 || digits > MAX_DISPLAY_DECIMAL_PLACES)
    throw new RpnError(`display digit count must be from 0 to ${MAX_DISPLAY_DECIMAL_PLACES}`);
  calc.setDisplayMode(mode as DisplayMode, digits);
}

function setBaseMode(calc: CalculatorMachine, token: string): boolean {
  switch (token) {
    case "dec":
      calc.setBaseMode(BaseMode.Dec);
      return true;
    case "hex":
      calc.setBaseMode(BaseMode.Hex);
      return true;
    case "oct":
      calc.setBaseMode(BaseMode.Oct);
      return true;
    case "bin":
      calc.setBaseMode(BaseMode.Bin);
      return true;
    default:
      return false;
  }
}
