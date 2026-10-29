export function identity(value: unknown): unknown {
  return value;
}
export function increment(value: bigint): bigint {
  return value + 1n;
}
export function imprecise(): number {
  return 0.1;
}
export function float32(): number {
  return Math.fround(0.1);
}
export function mutate(value: Record<string, bigint>): unknown {
  value["n"] = 2n;
  return value;
}
export function random(): number {
  return Math.random();
}
export function spin(value: bigint): bigint {
  while (value >= 0n) value += 1n;
  return value;
}
export function allocate(): string[] {
  return new Array<string>(10_000_000).fill("allocation witness");
}
export function mappedError(): never {
  throw new Error("original TypeScript location witness");
}
export function sparse(): bigint[] {
  return new Array<bigint>(2);
}
export function exotic(): object {
  class Result {
    value = 1n;
  }
  return new Result();
}
export function accessor(): object {
  return {
    get value(): bigint {
      throw new Error("getter must not execute");
    },
  };
}
export function cycle(): object {
  const result: Record<string, unknown> = {};
  result["self"] = result;
  return result;
}
export async function asynchronous(): Promise<bigint> {
  return await Promise.resolve(1n);
}
