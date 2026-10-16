"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fridayActivityService, type FridayListQuery, type FridayListResponse, type FridayOptions } from "@/lib/services/friday-activity";
import { fridayLiveError } from "./friday-api";

export function useFridayActivities(query: FridayListQuery) {
  const queryKey = JSON.stringify(query);
  const generation = useRef(0);
  const optionsGeneration = useRef(0);
  const [result, setResult] = useState<{ key: string; data: FridayListResponse } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [options, setOptions] = useState<FridayOptions | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    const requestGeneration = ++generation.current;
    setLoading(true);
    setFailure(null);
    try {
      const data = await fridayActivityService.list(JSON.parse(queryKey) as FridayListQuery);
      if (generation.current === requestGeneration) setResult({ key: queryKey, data });
    } catch (error) {
      if (generation.current === requestGeneration) setFailure({ key: queryKey, message: fridayLiveError(error) });
    } finally {
      if (generation.current === requestGeneration) setLoading(false);
    }
  }, [queryKey]);
  useEffect(() => {
    // Schedule the request after the effect has subscribed. Cancelling this
    // task also prevents Strict Mode's discarded mount from issuing a read.
    const task = window.setTimeout(() => void reload(), 0);
    return () => { window.clearTimeout(task); generation.current += 1; };
  }, [reload]);
  const loadOptions = useCallback(async () => {
    const requestGeneration = ++optionsGeneration.current;
    try { const data = await fridayActivityService.options(); if (optionsGeneration.current === requestGeneration) { setOptions(data); setOptionsError(null); } }
    catch (error) { if (optionsGeneration.current === requestGeneration) setOptionsError(fridayLiveError(error)); }
  }, []);
  useEffect(() => {
    const task = window.setTimeout(() => void loadOptions(), 0);
    return () => { window.clearTimeout(task); optionsGeneration.current += 1; };
  }, [loadOptions]);
  // Mutations invalidate reads before writing. An older GET can never replace a
  // saved revision; a new GET begins only after the write has completed.
  const beforeWrite = useCallback(() => { generation.current += 1; setLoading(false); }, []);
  const pending = loading || (result?.key !== queryKey && failure?.key !== queryKey);
  return { data: result?.key === queryKey ? result.data : null, error: failure?.key === queryKey ? failure.message : null, loading: pending, options, optionsError, reload, loadOptions, beforeWrite };
}
