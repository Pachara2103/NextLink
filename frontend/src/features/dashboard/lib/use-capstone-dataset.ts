"use client";
import { useMemo } from "react";
import type { CapstoneDataset } from "./capstone-types";
import { capstoneFromRows, capstoneStorageRows, isCapstoneStorageRow } from "./capstone-storage-rows";
import { academicPeriodKey } from "./academic-period";
import { useAcademicPeriod } from "./use-academic-period";
import { useLocalDataset } from "./use-local-dataset";

export const CAPSTONE_STORAGE_KEY = "nextlink.capstone.v2";
export function useCapstoneDataset(bundled: CapstoneDataset) {
  const storageKey = `${CAPSTONE_STORAGE_KEY}.${academicPeriodKey(useAcademicPeriod())}`;
  const sourceRows = useMemo(() => capstoneStorageRows(bundled), [bundled]);
  const state = useLocalDataset(CAPSTONE_STORAGE_KEY, sourceRows, isCapstoneStorageRow, {
    key: storageKey,
  });
  const data = useMemo(() => capstoneFromRows(state.items), [state.items]);
  return { ...state, data, save: (next: CapstoneDataset) => state.update(() => capstoneStorageRows(next)) };
}
