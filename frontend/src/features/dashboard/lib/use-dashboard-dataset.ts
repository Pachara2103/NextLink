"use client";
import { useLocalDataset } from "./use-local-dataset";
import type { RowValidator } from "./local-dataset";

/** The integrated demo has no write API; live data needs an authenticated service adapter. */
export function useDashboardDataset<T extends { id: string; revision?: number }>(key: string, source: T[], validate: RowValidator<T>) {
  return useLocalDataset(key, source, validate);
}
