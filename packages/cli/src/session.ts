export type ReplInput =
  | { readonly type: "empty" }
  | { readonly type: "quit" }
  | { readonly type: "help" }
  | { readonly type: "stack"; readonly full: boolean }
  | { readonly type: "expression"; readonly source: string };

export function parseReplInput(line: string): ReplInput {
  const command = line.trim().toLowerCase();
  if (command === "") return { type: "empty" };
  if (command === "quit") return { type: "quit" };
  if (command === "help") return { type: "help" };
  if (command === "stack") return { type: "stack", full: true };
  if (command === "stack off") return { type: "stack", full: false };
  return { type: "expression", source: line };
}
