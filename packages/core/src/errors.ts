export class RpnError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RpnError";
  }
}

export class StackUnderflowError extends RpnError {
  constructor(message: string) {
    super(message);
    this.name = "StackUnderflowError";
  }
}
