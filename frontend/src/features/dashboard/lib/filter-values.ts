/** Query strings are input, even when TypeScript expects an enum. */
export function allowedValue<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  return allowed.find(candidate => candidate === value);
}

export const QUEUE_VALUES = ["BLOCKED", "WAITING", "IN_PROGRESS"] as const;
export const WORKFLOW_VALUES = ["RECEIVED", "NOT_RECEIVED", "IN_PROGRESS", "DONE", "BLOCKED", "NOT_APPLICABLE", "UNKNOWN"] as const;
