import type { Control } from "./ui.js";
import { select } from "./ui.js";

export function checkSelection(): void {
  const control: Control = {
    id: "farm",
    enabled: true,
    generation: 9007199254740993n,
  };
  if (select([control], "farm", control.generation) !== control)
    throw new Error("Selection lost identity");
  if (select([control], "farm", control.generation - 1n) !== undefined)
    throw new Error("Stale generation accepted");
}
