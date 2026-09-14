"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { applyDatasetChanges, datasetChanges, DatasetConflict, LegacyDataset, rebaseDataset, restoreDataset, storedDataset, type RowChanges, type RowValidator } from "./local-dataset";
import { periodStorageKey } from "./academic-period";
import { useAcademicPeriod } from "./use-academic-period";
import { useAuth } from "@/store/auth-store";
import { dashboardStorageKey } from "./demo-storage";

export type StorageRecovery = { raw: string; changes: RowChanges[] };
type Options<T> = { key?: string; legacyKey?: string; disabled?: boolean; migrate?: (parsed: unknown, bundled: T[]) => unknown };

export function useLocalDataset<T extends { id: string }>(baseKey: string, bundled: T[], validate: RowValidator<T>, options: Options<T> = {}) {
  const period = useAcademicPeriod();
  const { user } = useAuth();
  // Mounted only after RequireAuth confirms the session. Never reuse standalone overrides.
  if (!user) throw new Error("Dashboard requires a confirmed staff session");
  const storageKey = dashboardStorageKey(user.id, options.key ?? periodStorageKey(baseKey, period));
  const [items, setItems] = useState(bundled);
  const [editedAt, setEditedAt] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [warning, setWarning] = useState("");
  const [hasOverrides, setHasOverrides] = useState(false);
  const [recovery, setRecovery] = useState<StorageRecovery | null>(null);
  const current = useRef(bundled);
  const initial = useRef(bundled);
  const validator = useRef(validate);
  const settings = useRef(options);
  const loaded = useRef(false);
  const history = useRef<{ before: T[]; after: T[] } | null>(null);

  const read = useCallback(() => {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return { items: initial.current, editedAt: null, hasOverrides: false, raw };
    const parsed: unknown = JSON.parse(raw);
    const normalized = settings.current.migrate ? settings.current.migrate(parsed, initial.current) : parsed;
    return { ...restoreDataset(normalized, initial.current, validator.current), raw };
  }, [storageKey]);
  const publish = useCallback((state: { items: T[]; editedAt: string | null; hasOverrides: boolean }) => {
    current.current = state.items; setItems(state.items); setEditedAt(state.editedAt); setHasOverrides(state.hasOverrides);
  }, []);
  const describeError = useCallback((error: unknown) => {
    setWarning(error instanceof DOMException ? "บันทึกในเบราว์เซอร์ไม่ได้ กรุณาตรวจสิทธิ์หรือพื้นที่ว่าง การแก้ไขยังอยู่ในแบบฟอร์ม" : error instanceof Error ? error.message : "บันทึกข้อมูลไม่ได้ กรุณาลองใหม่");
    if (error instanceof LegacyDataset) {
      setRecovery({ raw: localStorage.getItem(storageKey) ?? "", changes: error.changes });
    } else if (error instanceof DatasetConflict) {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          // This is only a review proposal. Nothing is applied until the user
          // selects fields, confirms, and the result passes the row validator.
          const proposed = applyDatasetChanges(initial.current, parsed.items, false);
          if (proposed.every(validator.current)) setRecovery({ raw, changes: datasetChanges(initial.current, proposed) });
        } catch { /* The original bytes remain available in storage. */ }
      }
    }
  }, [storageKey]);
  useEffect(() => {
    if (options.disabled) return;
    const refresh = () => {
      try { publish(read()); setWarning(""); setRecovery(null); }
      catch (error) {
        describeError(error);
        if (!(error instanceof LegacyDataset) && !(error instanceof DatasetConflict)) {
          setWarning("อ่านข้อมูลในเบราว์เซอร์ไม่ได้ กรุณาดาวน์โหลดสำเนาหรือคืนค่าตั้งต้น");
          try { const raw = localStorage.getItem(storageKey); if (raw) setRecovery({ raw, changes: [] }); } catch { /* Storage itself is unavailable. */ }
        }
      }
      finally { loaded.current = true; setReady(true); }
    };
    refresh();
    const changed = (event: StorageEvent) => { if (event.storageArea === localStorage && (event.key === storageKey || event.key === null)) refresh(); };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, [read, publish, describeError, storageKey, options.disabled]);

  const lock = useCallback(async (action: () => boolean): Promise<boolean> => {
    if (!loaded.current) return false;
    try {
      if (!navigator.locks) throw new Error("เบราว์เซอร์นี้ไม่รองรับการบันทึกพร้อมกันอย่างปลอดภัย กรุณาเปิดผ่าน HTTPS หรือ localhost");
      return await navigator.locks.request(storageKey, action);
    } catch (error) { describeError(error); return false; }
  }, [describeError, storageKey]);
  const commit = useCallback((next: T[]) => {
    if (!next.every(validator.current)) throw new Error("ข้อมูลบางรายการไม่ถูกต้อง กรุณาตรวจข้อมูลที่แก้ไข");
    const at = new Date().toISOString();
    const saved = storedDataset(next, initial.current, at, crypto.randomUUID());
    localStorage.setItem(storageKey, JSON.stringify(saved));
    publish({ items: next, editedAt: at, hasOverrides: saved.items.length > 0 });
    setRecovery(null); setWarning("");
    return true;
  }, [storageKey, publish]);
  const update = useCallback(async (updater: (current: T[]) => T[]): Promise<boolean> => {
    // Capture the user's view before waiting for the lock. Re-running the
    // updater against a newer row would silently overwrite a stale form.
    const before = current.current;
    const proposal = updater(before);
    return lock(() => {
      const latest = read().items;
      const next = rebaseDataset(before, proposal, latest);
      const result = commit(next);
      history.current = { before: latest, after: next };
      return result;
    });
  }, [lock, read, commit]);
  const undo = useCallback(async () => {
    const previous = history.current;
    if (!previous) return false;
    return lock(() => {
      const result = commit(rebaseDataset(previous.after, previous.before, read().items));
      history.current = null;
      return result;
    });
  }, [lock, commit, read]);
  const reset = useCallback(async () => {
    let observed: string | null;
    try { observed = localStorage.getItem(storageKey); }
    catch (error) { describeError(error); return false; }
    return lock(() => {
      if (localStorage.getItem(storageKey) !== observed) throw new DatasetConflict(["ข้อมูลที่กำลังคืนค่า"]);
      if (settings.current.legacyKey) return commit(initial.current);
      localStorage.removeItem(storageKey);
      publish({ items: initial.current, editedAt: null, hasOverrides: false });
      history.current = null; setWarning(""); setRecovery(null);
      return true;
    });
  }, [lock, storageKey, commit, publish, describeError]);
  const recover = useCallback(async (changes: RowChanges[]) => lock(() => {
    if (!recovery || localStorage.getItem(storageKey) !== recovery.raw) throw new DatasetConflict(["ข้อมูลที่กำลังตรวจทาน"]);
    return commit(applyDatasetChanges(initial.current, changes, false));
  }), [lock, storageKey, recovery, commit]);

  return { items, update, undo, reset, editedAt, ready, warning, hasOverrides, recovery, recover };
}
