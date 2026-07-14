import { Decimal } from "./vendor/decimal.js/decimal.mjs";
import {
  AngleMode,
  BaseMode,
  DISPLAY_SIGNIFICANT_DIGITS,
  DisplayMode,
  E,
  MAX_FRACTION_DENOMINATOR,
  MAX_DISPLAY_DECIMAL_PLACES,
  PI,
  RpnCalculator,
  RpnError,
  ZERO,
  approximateFraction,
  baseIntegerFromDecimal,
  clampBaseInteger,
  parseBaseInteger,
  parseDecimal,
  parseFraction,
  type BinaryOp,
  type NumberValue,
  type ReadonlyDisplaySettings,
  type UnaryOp,
  type VariableValue,
} from "./calculator.js";
import { fixedWouldExceedDisplay, fixedWouldRoundToZero } from "./display.js";

export type CommandEvent =
  | {
      readonly type: "variable";
      readonly name: string;
      readonly value: NumberValue;
      readonly display: ReadonlyDisplaySettings;
      readonly baseMode: BaseMode;
    }
  | { readonly type: "notice"; readonly code: "no_variables" };

export interface ExecutionResult {
  readonly events: readonly CommandEvent[];
}

interface CommandContext {
  readonly calc: RpnCalculator;
  readonly events: CommandEvent[];
}

interface CommandDescriptor {
  readonly aliases: readonly string[];
  execute(context: CommandContext, tokens: readonly string[], index: number): number;
}

interface CommandRegistry {
  readonly beforeNumber: ReadonlyMap<string, CommandDescriptor>;
  readonly afterNumber: ReadonlyMap<string, CommandDescriptor>;
}

let commandRegistry: CommandRegistry | undefined;

export function processLine(calc: RpnCalculator, line: string): ExecutionResult {
  return processTokens(calc, line.split(/\s+/).filter(Boolean));
}

export function processTokens(calc: RpnCalculator, tokens: Iterable<string>): ExecutionResult {
  return calc.transaction(() => processTokensUnchecked(calc, tokens));
}

function processTokensUnchecked(calc: RpnCalculator, tokens: Iterable<string>): ExecutionResult {
  const tokenList = Array.from(tokens);
  const events: CommandEvent[] = [];
  const context = { calc, events };
  const registry = getCommandRegistry();
  let index = 0;
  while (index < tokenList.length) {
    const token = tokenList[index]?.trim().toLowerCase() ?? "";
    const beforeNumber = registry.beforeNumber.get(token);
    if (beforeNumber !== undefined) {
      index = beforeNumber.execute(context, tokenList, index);
      continue;
    }
    if (processNumber(calc, token)) {
      index += 1;
      continue;
    }
    const afterNumber = registry.afterNumber.get(token);
    if (afterNumber !== undefined) {
      index = afterNumber.execute(context, tokenList, index);
      continue;
    }
    throw new RpnError(`unknown token: ${JSON.stringify(token)}`, {
      code: "unknown_token",
      token,
    });
  }
  return { events };
}

function processNumber(calc: RpnCalculator, token: string): boolean {
  if (token === "") return true;
  const parsedInput =
    calc.baseMode === BaseMode.Dec
      ? parseDecimalInput(token)
      : { isFraction: false, value: parseBaseInteger(token, calc.baseMode) };
  if (parsedInput.value === undefined) return false;
  calc.pushNumber(parsedInput.value);
  if (parsedInput.isFraction) calc.setFractionDisplay(0);
  return true;
}

function getCommandRegistry(): CommandRegistry {
  commandRegistry ??= createCommandRegistry();
  return commandRegistry;
}

function createCommandRegistry(): CommandRegistry {
  const beforeNumber = new Map<string, CommandDescriptor>();
  const afterNumber = new Map<string, CommandDescriptor>();

  registerZero(beforeNumber, ["dec"], ({ calc }) => calc.setBaseMode(BaseMode.Dec));
  registerZero(beforeNumber, ["hex"], ({ calc }) => calc.setBaseMode(BaseMode.Hex));
  registerZero(beforeNumber, ["oct"], ({ calc }) => calc.setBaseMode(BaseMode.Oct));
  registerZero(beforeNumber, ["bin"], ({ calc }) => calc.setBaseMode(BaseMode.Bin));

  for (const mode of ["fix", "sci", "eng"] as const) {
    registerRequired(afterNumber, [mode], "a digit count", ({ calc }, argument) =>
      setDisplayMode(calc, mode, argument),
    );
  }

  registerDescriptor(afterNumber, {
    aliases: ["frac"],
    execute({ calc }, tokens, index) {
      const denominatorToken = tokens[index + 1];
      if (denominatorToken !== undefined && isPlainIntegerToken(denominatorToken)) {
        setFractionDisplay(calc, denominatorToken);
        return index + 2;
      }
      calc.toggleFractionDisplay();
      return index + 1;
    },
  });

  for (const command of ["sto", "rcl", "view"] as const) {
    registerRequired(afterNumber, [command], "a variable name", (context, variableName) =>
      processVariableCommand(context.calc, command, variableName, context.events),
    );
  }

  registerDescriptor(afterNumber, {
    aliases: ["clear"],
    execute({ calc }, tokens, index) {
      const scope = tokens[index + 1]?.trim().toLowerCase();
      if (scope === "var") {
        calc.clearVariables();
        return index + 2;
      }
      if (scope === "all") {
        calc.clearAll();
        return index + 2;
      }
      calc.clear();
      return index + 1;
    },
  });

  registerZero(afterNumber, ["rnd", "round"], ({ calc }) =>
    calc.applyUnary((x) => roundToDisplay(x, calc.display), { preserveLastX: true }),
  );
  registerZero(afterNumber, ["enter", "dup"], ({ calc }) => calc.enter());
  registerZero(afterNumber, ["drop"], ({ calc }) => calc.drop());
  registerZero(afterNumber, ["clx"], ({ calc }) => calc.clearX());
  registerZero(afterNumber, ["swap", "xy"], ({ calc }) => calc.swap());
  registerZero(afterNumber, ["lastx"], ({ calc }) => calc.recallLastX());
  registerZero(afterNumber, ["all"], ({ calc }) =>
    calc.setDisplayMode(DisplayMode.All, calc.display.digits),
  );
  registerZero(afterNumber, ["vars"], ({ calc, events }) => {
    const variables = calc.listVariables();
    if (variables.length === 0) events.push({ type: "notice", code: "no_variables" });
    else {
      events.push(...variables.map((variable) => variableEvent(calc, variable)));
    }
  });
  registerZero(afterNumber, ["deg"], ({ calc }) => calc.setAngleMode(AngleMode.Deg));
  registerZero(afterNumber, ["rad"], ({ calc }) => calc.setAngleMode(AngleMode.Rad));
  registerZero(afterNumber, ["grad"], ({ calc }) => calc.setAngleMode(AngleMode.Grad));
  registerZero(afterNumber, ["pi"], ({ calc }) => calc.pushNumber(PI));
  registerZero(afterNumber, ["e"], ({ calc }) => calc.pushNumber(E));

  for (const aliases of [["+"], ["-"], ["*"], ["/"], ["^", "pow"], ["mod"]]) {
    registerZero(afterNumber, aliases, ({ calc }) => {
      const token = aliases[0] ?? "";
      const operation = binaryOpsFor(calc)[token];
      if (operation === undefined) throw new Error(`missing binary operation: ${token}`);
      calc.applyBinary(operation);
    });
  }

  const unaryOperations: Array<readonly [readonly string[], UnaryOp]> = [
    [["sqrt"], sqrt],
    [["sq"], (x) => x.times(x)],
    [["!", "fact"], factorial],
    [["ln"], naturalLog],
    [["log"], commonLog],
    [["exp"], (x) => Decimal.exp(x)],
    [["abs"], (x) => x.abs()],
    [["int"], (x) => x.trunc()],
    [["fpart"], fractionalPart],
    [["floor"], (x) => x.floor()],
    [["ceil"], (x) => x.ceil()],
    [["chs", "neg"], (x) => x.neg()],
    [["1/x"], reciprocal],
  ];
  for (const [aliases, operation] of unaryOperations) {
    registerZero(afterNumber, aliases, ({ calc }) => calc.applyUnary(operation));
  }

  for (const token of [
    "sin",
    "cos",
    "tan",
    "asin",
    "acos",
    "atan",
    "sinh",
    "cosh",
    "tanh",
    "asinh",
    "acosh",
    "atanh",
  ] as const) {
    registerZero(afterNumber, [token], ({ calc }) => calc.applyUnary(trigOps(calc)[token]));
  }

  return { beforeNumber, afterNumber };
}

function registerZero(
  registry: Map<string, CommandDescriptor>,
  aliases: readonly string[],
  handler: (context: CommandContext) => void,
): void {
  registerDescriptor(registry, {
    aliases,
    execute(context, _tokens, index) {
      handler(context);
      return index + 1;
    },
  });
}

function registerRequired(
  registry: Map<string, CommandDescriptor>,
  aliases: readonly string[],
  argumentDescription: string,
  handler: (context: CommandContext, argument: string) => void,
): void {
  registerDescriptor(registry, {
    aliases,
    execute(context, tokens, index) {
      const argument = tokens[index + 1];
      const operation = tokens[index]?.trim().toLowerCase() ?? aliases[0] ?? "command";
      if (argument === undefined) {
        throw new RpnError(`${operation} requires ${argumentDescription}`, {
          code: "missing_argument",
          operation,
        });
      }
      handler(context, argument);
      return index + 2;
    },
  });
}

function registerDescriptor(
  registry: Map<string, CommandDescriptor>,
  descriptor: CommandDescriptor,
): void {
  for (const alias of descriptor.aliases) {
    if (registry.has(alias)) throw new Error(`duplicate command alias: ${alias}`);
    registry.set(alias, descriptor);
  }
}

function parseDecimalInput(token: string): { isFraction: boolean; value: Decimal | undefined } {
  const fraction = parseFraction(token);
  if (fraction !== undefined) return { isFraction: true, value: fraction };
  return { isFraction: false, value: parseDecimal(token) };
}

function binaryOpsFor(calc: RpnCalculator): Record<string, BinaryOp> {
  if (calc.baseMode !== BaseMode.Dec) {
    return {
      "+": baseBinaryOp((a, b) => a + b),
      "-": baseBinaryOp((a, b) => a - b),
      "*": baseBinaryOp((a, b) => a * b),
      "/": baseDivide,
      "^": decimalPower,
      pow: decimalPower,
      mod: baseModulo,
    };
  }

  return {
    "+": (a, b) => a.plus(b),
    "-": (a, b) => a.minus(b),
    "*": (a, b) => a.times(b),
    "/": divide,
    "^": decimalPower,
    pow: decimalPower,
    mod: modulo,
  };
}

function baseBinaryOp(op: (a: bigint, b: bigint) => bigint): BinaryOp {
  return (a, b) =>
    new Decimal(clampBaseInteger(op(requireBaseInteger(a), requireBaseInteger(b))).toString());
}

function baseDivide(a: Decimal, b: Decimal): Decimal {
  const divisor = requireBaseInteger(b);
  if (divisor === 0n) {
    throw new RpnError("invalid operation (divide by zero)", { code: "divide_by_zero" });
  }

  const result = requireBaseInteger(a) / divisor;
  return new Decimal(clampBaseInteger(result).toString());
}

function baseModulo(a: Decimal, b: Decimal): Decimal {
  const divisor = requireBaseInteger(b);
  if (divisor === 0n) {
    throw new RpnError("invalid operation (divide by zero)", { code: "divide_by_zero" });
  }

  const result = requireBaseInteger(a) % divisor;
  return new Decimal(clampBaseInteger(result).toString());
}

function requireBaseInteger(value: Decimal): bigint {
  const integer = baseIntegerFromDecimal(value);
  if (integer === undefined) {
    throw new RpnError("base operation exceeds 36-bit word size", { code: "range" });
  }
  return integer;
}

function processVariableCommand(
  calc: RpnCalculator,
  command: "sto" | "rcl" | "view",
  variableName: string,
  events: CommandEvent[],
): void {
  if (command === "sto") calc.storeVariable(variableName);
  else if (command === "rcl") calc.recallVariable(variableName);
  else events.push(variableEvent(calc, calc.viewVariable(variableName)));
}

function variableEvent(calc: RpnCalculator, variable: VariableValue): CommandEvent {
  const view = calc.view();
  return {
    type: "variable",
    ...variable,
    display: view.display,
    baseMode: view.baseMode,
  };
}

function decimalPower(a: Decimal, b: Decimal): Decimal {
  if (b.isInteger()) {
    if (b.abs().gt(Number.MAX_SAFE_INTEGER)) {
      throw new RpnError("invalid operation (exponent out of range)", { code: "range" });
    }
    return a.pow(b.toNumber());
  }
  return Decimal.pow(a, b);
}

function factorial(value: Decimal): Decimal {
  if (!value.isInteger() || value.isNegative() || value.gt(253)) {
    throw new RpnError("factorial requires an integer from 0 to 253", { code: "domain" });
  }

  let result = new Decimal(1);
  for (let factor = 2; factor <= value.toNumber(); factor += 1) {
    result = result.times(factor);
  }
  return result;
}

function roundToDisplay(value: Decimal, display: RpnCalculator["display"]): Decimal {
  if (display.fraction.enabled)
    return roundToFractionDisplay(value, display.fraction.maxDenominator);

  switch (display.mode) {
    case DisplayMode.Fix:
      if (fixedWouldRoundToZero(value, display.digits)) return ZERO;
      if (fixedWouldExceedDisplay(value, display.digits)) {
        return value.toSignificantDigits(display.digits + 1);
      }
      return new Decimal(value.toFixed(display.digits));
    case DisplayMode.Sci:
    case DisplayMode.Eng:
      return value.toSignificantDigits(display.digits + 1);
    case DisplayMode.All:
      return value.toSignificantDigits(DISPLAY_SIGNIFICANT_DIGITS);
  }
}

function roundToFractionDisplay(value: Decimal, maxDenominator: number): Decimal {
  if (value.isZero()) return ZERO;

  const sign = value.isNegative() ? -1 : 1;
  const absolute = value.abs();
  const integerPart = absolute.trunc();
  const fractionPart = absolute.minus(integerPart);
  const [numerator, denominator] = approximateFraction(fractionPart, maxDenominator);
  const roundedMagnitude = new Decimal(integerPart.toFixed(0)).plus(
    new Decimal(numerator.toString()).div(denominator.toString()),
  );

  return sign < 0 ? roundedMagnitude.neg() : roundedMagnitude;
}

function trigOps(
  calc: RpnCalculator,
): Pick<
  Record<string, UnaryOp>,
  | "sin"
  | "cos"
  | "tan"
  | "asin"
  | "acos"
  | "atan"
  | "sinh"
  | "cosh"
  | "tanh"
  | "asinh"
  | "acosh"
  | "atanh"
> {
  return {
    sin: (x) => exactQuadrantTrig(calc, x, "sin") ?? Decimal.sin(calc.toRadians(x)),
    cos: (x) => exactQuadrantTrig(calc, x, "cos") ?? Decimal.cos(calc.toRadians(x)),
    tan: (x) => exactQuadrantTrig(calc, x, "tan") ?? Decimal.tan(calc.toRadians(x)),
    asin: (x) => calc.fromRadians(inverseCircularTrig(x, (value) => Decimal.asin(value))),
    acos: (x) => calc.fromRadians(inverseCircularTrig(x, (value) => Decimal.acos(value))),
    atan: (x) => calc.fromRadians(Decimal.atan(x)),
    sinh: (x) => Decimal.sinh(x),
    cosh: (x) => Decimal.cosh(x),
    tanh: (x) => Decimal.tanh(x),
    asinh: (x) => Decimal.asinh(x),
    acosh: acosh,
    atanh: atanh,
  };
}

function exactQuadrantTrig(
  calc: RpnCalculator,
  x: Decimal,
  op: "sin" | "cos" | "tan",
): Decimal | undefined {
  const unit =
    calc.angleMode === AngleMode.Deg
      ? new Decimal(90)
      : calc.angleMode === AngleMode.Grad
        ? new Decimal(100)
        : undefined;
  if (unit === undefined) return undefined;

  const quarterTurns = x.div(unit);
  if (!quarterTurns.isInteger()) return undefined;

  const quadrant = positiveModulo(quarterTurns, 4);
  if (op === "sin") {
    if (quadrant === 0 || quadrant === 2) return new Decimal(0);
    return new Decimal(quadrant === 1 ? 1 : -1);
  }
  if (op === "cos") {
    if (quadrant === 1 || quadrant === 3) return new Decimal(0);
    return new Decimal(quadrant === 0 ? 1 : -1);
  }

  if (quadrant === 1 || quadrant === 3) {
    throw new RpnError("invalid operation (tangent undefined)", { code: "domain" });
  }
  return new Decimal(0);
}

function positiveModulo(value: Decimal, divisor: number): number {
  const remainder = value.mod(divisor).toNumber();
  return ((remainder % divisor) + divisor) % divisor;
}

function inverseCircularTrig(x: Decimal, op: (value: Decimal.Value) => Decimal): Decimal {
  if (x.lt(-1) || x.gt(1)) {
    throw new RpnError("invalid operation (inverse trigonometry domain error)", {
      code: "domain",
    });
  }
  return op(x);
}

function acosh(x: Decimal): Decimal {
  if (x.lt(1)) {
    throw new RpnError("invalid operation (hyperbolic domain error)", { code: "domain" });
  }
  return Decimal.acosh(x);
}

function atanh(x: Decimal): Decimal {
  if (x.lte(-1) || x.gte(1)) {
    throw new RpnError("invalid operation (hyperbolic domain error)", { code: "domain" });
  }
  return Decimal.atanh(x);
}

function divide(a: Decimal, b: Decimal): Decimal {
  if (b.isZero()) {
    throw new RpnError("invalid operation (divide by zero)", { code: "divide_by_zero" });
  }
  return a.div(b);
}

function modulo(a: Decimal, b: Decimal): Decimal {
  if (b.isZero()) {
    throw new RpnError("invalid operation (divide by zero)", { code: "divide_by_zero" });
  }
  return a.mod(b);
}

function fractionalPart(x: Decimal): Decimal {
  return x.minus(x.trunc());
}

function sqrt(x: Decimal): Decimal {
  if (x.isNegative()) {
    throw new RpnError("invalid operation (imaginary numbers not supported)", { code: "domain" });
  }
  return x.sqrt();
}

function naturalLog(x: Decimal): Decimal {
  if (x.lte(0)) {
    throw new RpnError("invalid operation (logarithm domain error)", { code: "domain" });
  }
  return Decimal.ln(x);
}

function commonLog(x: Decimal): Decimal {
  if (x.lte(0)) {
    throw new RpnError("invalid operation (logarithm domain error)", { code: "domain" });
  }
  return Decimal.log10(x);
}

function reciprocal(x: Decimal): Decimal {
  if (x.isZero()) {
    throw new RpnError("invalid operation (divide by zero)", { code: "divide_by_zero" });
  }
  return new Decimal(1).div(x);
}

function setDisplayMode(
  calc: RpnCalculator,
  mode: "fix" | "sci" | "eng",
  digitsToken: string,
): void {
  const normalizedDigitsToken = digitsToken.trim();
  if (!/^[+-]?\d+$/.test(normalizedDigitsToken)) {
    throw new RpnError(`display digit count must be an integer: ${JSON.stringify(digitsToken)}`, {
      code: "invalid_argument",
    });
  }

  const digits = Number(normalizedDigitsToken);
  if (digits < 0 || digits > MAX_DISPLAY_DECIMAL_PLACES) {
    throw new RpnError(`display digit count must be from 0 to ${MAX_DISPLAY_DECIMAL_PLACES}`, {
      code: "range",
    });
  }

  calc.setDisplayMode(mode as DisplayMode, digits);
}

function setFractionDisplay(calc: RpnCalculator, denominatorToken: string): void {
  const denominator = Number(denominatorToken.trim());
  if (!Number.isInteger(denominator)) {
    throw new RpnError(
      `fraction denominator must be an integer from 0 to ${MAX_FRACTION_DENOMINATOR}`,
      { code: "invalid_argument" },
    );
  }

  calc.setFractionDisplay(denominator);
}

function isPlainIntegerToken(token: string): boolean {
  return /^[+-]?\d+$/.test(token.trim());
}
