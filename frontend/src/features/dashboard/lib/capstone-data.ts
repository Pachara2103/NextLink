import rawDataset from "@/features/dashboard/data/capstone-projects.json";
import { isCapstoneDataset } from "./capstone-validation";
import type { CapstoneDataset } from "./capstone-types";

export function getCapstoneData(): CapstoneDataset {
  if (!isCapstoneDataset(rawDataset)) throw new Error("Invalid bundled Capstone dataset");
  return rawDataset;
}
