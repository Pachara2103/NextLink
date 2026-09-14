"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Selecting a record, opening the dialog for it, and putting focus back where
 * it came from afterwards.
 *
 * All three dashboards did this identically, which is why the focus-restore and
 * the focus-the-dialog-on-open fixes each had to be written three times.
 */
export function useRecordDialog<T extends { id: string }>(records: T[]) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const dialogNode = useRef<HTMLDialogElement | null>(null);
  const lastTriggerRef = useRef<HTMLElement | null>(null);
  const restoreFocus = useRef(false);

  const selected = records.find((record) => record.id === selectedId) ?? null;

  const hasSelected = selected !== null;

  // A lazy dialog can mount after the selection effect has already run.
  // Open on attachment as well as on selection, including the loading dialog.
  const dialogRef = useCallback((node: HTMLDialogElement | null) => {
    dialogNode.current = node;
    if (node && hasSelected && !node.open) {
      node.showModal();
      node.focus();
    }
  }, [hasSelected]);

  useEffect(() => {
    const node = dialogNode.current;
    if (selected && node && !node.open) {
      node.showModal();
      node.focus();
    } else if (!selected) {
      if (node?.open) node.close();
      // Restore after React removes the dialog, not on a timer that can race
      // the commit and focus a still-inert background button.
      if (restoreFocus.current) {
        restoreFocus.current = false;
        lastTriggerRef.current?.focus();
      }
    }
  }, [selected]);

  const open = useCallback((id: string, trigger?: HTMLElement) => {
    lastTriggerRef.current = trigger ?? null;
    setSelectedId(id);
  }, []);

  const close = useCallback(() => {
    restoreFocus.current = true;
    dialogNode.current?.close();
    setSelectedId(null);
  }, []);

  return { selected, dialogRef, open, close };
}
