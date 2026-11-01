"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getJson } from "@/lib/services/http";
import { fridayLiveError } from "./friday-api";

/** Load a visible report only; reject old filter/period and pre-write responses. */
export function useFridayReport<T>(path: string | null) {
  const generation = useRef(0);
  const [result, setResult] = useState<{ key: string; data: T } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const reload = useCallback(async () => {
    if (!path) return;
    const request = ++generation.current;
    setBusy(true); setFailure(null);
    try {
      const data = await getJson<T>(path);
      if (request === generation.current) setResult({ key: path, data });
    } catch (error) {
      if (request === generation.current) setFailure({ key: path, message: fridayLiveError(error) });
    } finally {
      if (request === generation.current) setBusy(false);
    }
  }, [path]);
  useEffect(() => {
    const task = window.setTimeout(() => void reload(), 0);
    return () => { window.clearTimeout(task); generation.current += 1; };
  }, [reload]);
  return {
    data: result?.key === path ? result.data : null,
    error: failure?.key === path ? failure.message : null,
    loading: Boolean(path) && (busy || (result?.key !== path && failure?.key !== path)),
    reload,
  };
}
