"use client";
import { useLocalDataset } from './use-local-dataset';
import { directorySeed, directoryStorageKey, isDirectoryCompany } from './company-directory';
export function useCompanyDirectory() {
  return useLocalDataset(directoryStorageKey, directorySeed, isDirectoryCompany, { key: directoryStorageKey });
}
