"use client";

import { useEffect, useState } from "react";

/** Keep input/URL updates immediate while coalescing remote reads. */
export function useDebouncedValue(value: string, delayMs = 250) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const task = window.setTimeout(() => setSettled(value), delayMs);
    return () => window.clearTimeout(task);
  }, [value, delayMs]);
  return settled;
}
