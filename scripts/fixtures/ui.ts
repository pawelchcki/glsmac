/** Representative immutable UI orchestration; no native object references. */
export interface Control {
  readonly id: string;
  readonly enabled: boolean;
  readonly generation: bigint;
}
export function select(
  controls: readonly Control[],
  id: string,
  generation: bigint,
): Control | undefined {
  return controls.find(
    (control) =>
      control.id === id && control.enabled && control.generation === generation,
  );
}
