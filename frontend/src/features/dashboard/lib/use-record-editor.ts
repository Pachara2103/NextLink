"use client";

import { sameValue } from "./local-dataset";
import { useUnsavedChanges } from "./use-unsaved-changes";
import { useRef, useState } from "react";
import type { FormEvent, MouseEvent, SyntheticEvent } from "react";

const DISCARD_PROMPT = "ยังไม่ได้บันทึกการแก้ไข ปิดหน้าต่างนี้แล้วข้อมูลที่แก้ไว้จะหายไป ต้องการปิดหรือไม่?";

/**
 * The draft lifecycle inside a record dialog: enter edit mode, track changes,
 * save, and refuse to throw away unsaved work on Esc or a backdrop click.
 *
 * The record and draft shapes differ per dashboard — a course draft and a MOU
 * draft list different fields for different reasons — but the lifecycle around
 * them is the same, and changing it should be one edit rather than three.
 */
export function useRecordEditor<TRecord extends { id: string }, TDraft>({
  record,
  toDraft,
  onSave,
  onClose,
}: {
  record: TRecord | null;
  toDraft: (record: TRecord) => TDraft;
  onSave: (id: string, draft: TDraft) => boolean | void | Promise<boolean | void>;
  onClose: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<TDraft | null>(null);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveFailed, setSaveFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [baseline, setBaseline] = useState<TDraft | null>(null);
  const inFlight = useRef(false);

  // Each dialog is keyed by record ID; drafts are created explicitly on edit.

  const updateDraft = <K extends keyof TDraft>(field: K, value: TDraft[K]) => {
    setDraft((current) => (current ? { ...current, [field]: value } : current));
  };

  const startEditing = () => {
    if (!record) return;
    const initialDraft = structuredClone(toDraft(record));
    setBaseline(initialDraft);
    setDraft(initialDraft);
    setSaveMessage("");
    setSaveError("");
    setSaveFailed(false);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    if (record) setDraft(toDraft(record));
    setSaveMessage("");
    setSaveError("");
    setSaveFailed(false);
    setIsEditing(false);
  };

  const saveEditing = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!record || !draft || inFlight.current) return;
    inFlight.current = true; setSaving(true);
    setSaveError("");
    try {
      if (!sameValue(toDraft(record), baseline)) throw new Error("ข้อมูลรายการนี้เปลี่ยนแล้ว กรุณาคัดลอกการแก้ไขที่ต้องการ แล้วเปิดแบบฟอร์มใหม่จากข้อมูลล่าสุด");
      const persisted = await onSave(record.id, draft);
      if (persisted === false) {
        setSaveFailed(true); setSaveError("บันทึกไม่สำเร็จ ข้อมูลที่แก้ยังอยู่ในแบบฟอร์ม กรุณาตรวจข้อมูลล่าสุดหรือข้อความแจ้งเตือนก่อนลองใหม่");
        return;
      }
      setIsEditing(false);
      setSaveFailed(false);
      setSaveMessage("บันทึกการแก้ไขแล้ว");
    } catch (error) {
      setSaveMessage("");
      setSaveError(error instanceof Error ? error.message : "บันทึกไม่ได้ กรุณาตรวจข้อมูลที่แก้ไข");
    } finally { inFlight.current = false; setSaving(false); }
  };

  const hasUnsavedEdits =
    isEditing && Boolean(record) && Boolean(draft) && !sameValue(draft, baseline);
  useUnsavedChanges(hasUnsavedEdits);

  const confirmDiscard = () => !inFlight.current && (!hasUnsavedEdits || window.confirm(DISCARD_PROMPT));

  const requestClose = () => {
    if (confirmDiscard()) onClose();
  };

  /** For <dialog onCancel>: Esc must be refusable, so preventDefault on "stay". */
  const handleCancel = (event: SyntheticEvent) => {
    if (!confirmDiscard()) {
      event.preventDefault();
      return;
    }
    onClose();
  };

  const handleBackdropClick = (event: MouseEvent) => {
    if (event.target === event.currentTarget) requestClose();
  };

  return {
    isEditing,
    saving,
    draft,
    setDraft,
    saveMessage,
    saveError,
    saveFailed,
    hasUnsavedEdits,
    updateDraft,
    startEditing,
    cancelEditing,
    saveEditing,
    requestClose,
    handleCancel,
    handleBackdropClick,
  };
}
