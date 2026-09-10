"use client";

import { useEffect, useSyncExternalStore } from "react";

import { lineService } from "@/lib/services/line";
import type { UpdateLog } from "@/types";

/**
 * The update log, read once and shared.
 *
 * Two places want it — the "ซิงค์ล่าสุด" line on the หน้าสรุปข้อมูลจากไลน์
 * panel, which needs it as soon as the panel opens, and the history dialog,
 * which is mounted only while it is open — so it cannot live in either. It is
 * an external store rather than a field on the console store because it is a
 * log: nothing else derives from it, it changes only when someone presses
 * อัปเดตข้อมูล, and it is read straight through `useSyncExternalStore` by
 * whoever cares.
 *
 * It is refilled three ways: the first mount that asks (`useUpdateLogs`), the
 * รีเฟรชประวัติ button, and the console store calling `refreshUpdateLogs()`
 * after a successful update — that press is what adds a row.
 */
export interface UpdateLogsState {
  status: "idle" | "loading" | "ready" | "error";
  /** Newest first. Kept across a failed re-read, so the page can still show it. */
  logs: UpdateLog[];
  /** When the list last came from the server. */
  readAt: string | null;
  /** The failure behind `status: "error"`, for the caller to word. */
  cause: unknown;
}

const EMPTY: UpdateLogsState = {
  status: "idle",
  logs: [],
  readAt: null,
  cause: null,
};

// One frozen object per state, because useSyncExternalStore compares snapshots
// by identity: rebuilding it per call would re-render on every check.
let snapshot: UpdateLogsState = EMPTY;
const listeners = new Set<() => void>();
/** Shared, so two mounts — or React's double effect in dev — read once. */
let inFlight: Promise<UpdateLog[]> | null = null;

function set(next: Partial<UpdateLogsState>): void {
  snapshot = { ...snapshot, ...next };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): UpdateLogsState {
  return snapshot;
}

/** Newest first. The API already sorts; this stops us depending on it. */
function newestFirst(logs: UpdateLog[]): UpdateLog[] {
  return [...logs].sort(
    (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
  );
}

async function read(): Promise<void> {
  const request = lineService.getUpdateLogs().then(newestFirst);
  inFlight = request;
  set({ status: "loading", cause: null });

  try {
    const logs = await request;
    // Last request wins, the same rule the console store's sync uses.
    if (inFlight !== request) return;
    inFlight = null;
    set({ status: "ready", logs, readAt: new Date().toISOString() });
  } catch (cause) {
    if (inFlight !== request) return;
    inFlight = null;
    console.error("getUpdateLogs failed", cause);
    set({ status: "error", cause });
  }
}

/** Reads only if nothing has been read and nothing is on its way. */
export function ensureUpdateLogs(): void {
  if (snapshot.status === "ready" || inFlight) return;
  void read();
}

/** รีเฟรชประวัติ, and what the store calls after an update writes a row. */
export function refreshUpdateLogs(): Promise<void> {
  return read();
}

/**
 * The shared log, read on the first mount that asks for it.
 *
 * Mounting a second reader — opening the dialog over a panel that already has
 * it — costs no request: `ensureUpdateLogs` sees a ready snapshot and returns.
 */
export function useUpdateLogs(): UpdateLogsState {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(ensureUpdateLogs, []);
  return state;
}

/** The most recent อัปเดตข้อมูล, or null while that is not known yet. */
export function latestUpdate(state: UpdateLogsState): UpdateLog | null {
  return state.logs[0] ?? null;
}

/** When the last อัปเดตข้อมูล ran, or null while that is not known yet. */
export function latestUpdateAt(state: UpdateLogsState): string | null {
  return state.logs[0]?.createdAt ?? null;
}

/**
 * The groups the last run could not finish.
 *
 * An empty array on a run that happened means every group came back clean —
 * which is a different thing from having no run to report — so callers that
 * want to say "สำเร็จทุกกลุ่ม" check `latestUpdate` first.
 */
export function latestErrorGroups(state: UpdateLogsState): string[] {
  return state.logs[0]?.errorGroups ?? [];
}
