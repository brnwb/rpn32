import {
  AngleMode,
  BaseMode,
  type CalculatorView,
  type CommandEvent,
  RpnError,
  formatNumber,
  formatStack,
} from "@brnwb/rpn32-core";

export function formatCalculatorStack(view: CalculatorView, full: boolean = false): string {
  return formatStack(view.stack, view.display, { baseMode: view.baseMode, full });
}

export function formatEvent(event: CommandEvent): string {
  if (event.type === "notice") return "no variables";
  const name = event.name === "i" ? "i" : event.name.toUpperCase();
  return `${name}: ${formatNumber(event.value, event.display, event.baseMode)}`;
}

export function formatError(error: unknown): string {
  if (error instanceof RpnError) return `error: ${error.message}`;
  if (error instanceof Error) return `internal error: ${error.message}`;
  return `internal error: ${String(error)}`;
}

export function promptFor(view: CalculatorView): string {
  const baseLabel = view.baseMode === BaseMode.Dec ? "" : `/${view.baseMode}`;
  if (view.angleMode === AngleMode.Rad) return `rpn(rad${baseLabel})> `;
  if (view.angleMode === AngleMode.Grad) return `rpn(grad${baseLabel})> `;
  return baseLabel === "" ? "rpn> " : `rpn(${view.baseMode})> `;
}
