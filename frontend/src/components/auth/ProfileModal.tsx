"use client";

import { useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { MESSAGES } from "@/lib/constants";
import { describeError } from "@/lib/services/errors";
import { useAuth } from "@/store/auth-store";

/**
 * The one thing a signed-in user may change about itself.
 *
 * Blank is allowed and means "no name": the column is nullable, and the console
 * renders NULL as "ยังไม่มีชื่อ", so clearing the field has to be possible
 * rather than being rejected as invalid input.
 */
export function ProfileModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { user, saveDisplayName } = useAuth();

  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await saveDisplayName(displayName.trim() || null);
      onClose();
    } catch (err) {
      console.error("saveDisplayName failed", err);
      setError(
        describeError(err, MESSAGES.profileUpdatePrefix, {
          network: `${MESSAGES.profileUpdatePrefix}: เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบการเชื่อมต่อ`,
          unknown: `${MESSAGES.profileUpdatePrefix} กรุณาลองใหม่อีกครั้ง`,
        }),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      icon="settings"
      title="ตั้งค่าบัญชี"
      subtitle="แก้ชื่อที่แสดงในคอนโซล"
      onClose={onClose}
      closeDisabled={saving}
      footer={
        <>
          <Button className="ml-auto" onClick={onClose} disabled={saving}>
            ยกเลิก
          </Button>
          <Button
            variant="primary"
            icon="check"
            loading={saving}
            onClick={handleSave}
          >
            บันทึกชื่อ
          </Button>
        </>
      }
    >
      <div className="flex items-center gap-3 rounded-xl border border-line-soft bg-sunken px-3.5 py-3">
        <span className="font-mono text-[10px] tracking-[0.14em] text-text-3 uppercase">
          ชื่อผู้ใช้
        </span>
        <span className="font-mono text-[13px] text-text-2">
          {user?.username ?? "-"}
        </span>
        <span className="ml-auto text-[11.5px] text-text-4">
          แก้ไขไม่ได้
        </span>
      </div>

      <TextField
        label="ชื่อที่แสดง"
        value={displayName}
        placeholder="เช่น พชร อุ้ยกิ้ม"
        hint="เว้นว่างไว้ได้ — คอนโซลจะแสดงว่า “ยังไม่มีชื่อ”"
        onChange={(event) => {
          setDisplayName(event.target.value);
          setError(null);
        }}
      />

      {error && <Alert tone="error" title={error} />}
    </Modal>
  );
}
