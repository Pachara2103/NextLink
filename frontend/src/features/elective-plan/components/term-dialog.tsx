"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ElectiveTermCreate } from "@/types";

interface TermDialogProps {
  isOpen: boolean;
  currentTermLabel: string;
  onConfirm: (payload: ElectiveTermCreate) => Promise<void>;
  onClose: () => void;
}

const SEMESTERS: Array<{ value: 1 | 2 | 3; label: string }> = [
  { value: 1, label: "ภาคต้น (1)" },
  { value: 2, label: "ภาคปลาย (2)" },
  { value: 3, label: "ภาคฤดูร้อน (3)" },
];

export function TermDialog({ isOpen, currentTermLabel, onConfirm, onClose }: TermDialogProps) {
  if (!isOpen) return null;
  return (
    <TermDialogForm
      isOpen={isOpen}
      currentTermLabel={currentTermLabel}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}

function TermDialogForm({
  currentTermLabel,
  onConfirm,
  onClose,
}: TermDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const currentThaiYear = new Date().getFullYear() + 543;
  const [year, setYear] = useState<number>(currentThaiYear);
  const [semester, setSemester] = useState<1 | 2 | 3>(1);
  const [hasAcknowledged, setHasAcknowledged] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkboxId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!year || year < 2500 || year > 2700) {
      setError("กรุณากรอกปีการศึกษา พ.ศ. ให้ถูกต้อง (เช่น 2569)");
      return;
    }
    if (!hasAcknowledged) {
      setError("กรุณากล่องยอมรับเพื่อยืนยันการจบเทอมปัจจุบัน");
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await onConfirm({ year, semester });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการเปิดเทอมใหม่";
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedSemesterLabel = SEMESTERS.find((s) => s.value === semester)?.label ?? "";

  return (
    <dialog
      className="course-dialog term-dialog"
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        if (!isSubmitting) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div className="dialog-header">
        <div>
          <p className="section-kicker">การจัดการภาคการศึกษา</p>
          <h2>จบเทอมปัจจุบันและเปิดเทอมใหม่</h2>
        </div>
        <button
          className="icon-button"
          type="button"
          disabled={isSubmitting}
          onClick={onClose}
          aria-label="ปิดหน้าต่าง"
        >
          ×
        </button>
      </div>

      <div className="dialog-content">
        <form className="course-form" onSubmit={handleSubmit}>
          <div className="course-form-wide">
            <div className="term-warning-box">
              <strong>ข้อควรระวัง:</strong>
              <p>
                เทอมปัจจุบัน (<strong>{currentTermLabel}</strong>) จะถูกปรับสถานะเป็น{" "}
                <span className="status-pill status-pill-subtle tone-neutral">ประวัติ (Archived)</span>{" "}
                ทันที ข้อมูลรายวิชา ตารางสอน และการจัดห้องในเทอมนี้จะถูกเก็บไว้เป็นประวัติและจะไม่สามารถแก้ไขเพิ่มเติมได้
              </p>
            </div>
          </div>

          <label>
            ปีการศึกษาใหม่ (พ.ศ.)
            <input
              type="number"
              min={2500}
              max={2700}
              value={year}
              disabled={isSubmitting}
              autoFocus
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </label>

          <label>
            ภาคการศึกษาใหม่
            <select
              value={semester}
              disabled={isSubmitting}
              onChange={(e) => setSemester(Number(e.target.value) as 1 | 2 | 3)}
            >
              {SEMESTERS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>

          <div className="course-form-wide term-confirm-checkbox">
            <label htmlFor={checkboxId} className="term-checkbox-label">
              <input
                id={checkboxId}
                type="checkbox"
                checked={hasAcknowledged}
                disabled={isSubmitting}
                onChange={(e) => setHasAcknowledged(e.target.checked)}
              />
              <span>
                ฉันเข้าใจและยืนยันที่จะปิดเทอม <strong>{currentTermLabel}</strong> และเริ่มวางแผนเทอม{" "}
                <strong>
                  {selectedSemesterLabel} {year}
                </strong>
              </span>
            </label>
          </div>

          {error ? (
            <p className="room-form-error course-form-wide" role="alert">
              {error}
            </p>
          ) : null}

          <div className="dialog-actions course-form-wide">
            <span className="panel-caption">
              การดำเนินการนี้ส่งผลต่อข้อมูลของทุกคนในระบบ
            </span>
            <span className="dialog-actions-end">
              <button
                className="secondary-button"
                type="button"
                disabled={isSubmitting}
                onClick={onClose}
              >
                ยกเลิก
              </button>
              <button
                className="danger-button"
                type="submit"
                disabled={isSubmitting || !hasAcknowledged}
              >
                {isSubmitting ? "กำลังดำเนินการ…" : "ยืนยันจบเทอมและเปิดเทอมใหม่"}
              </button>
            </span>
          </div>
        </form>
      </div>
    </dialog>
  );
}
