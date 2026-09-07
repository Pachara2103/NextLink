"use client";

import { useState } from "react";

import { Icon } from "@/components/icons";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { SelectField, TextField } from "@/components/ui/Field";
import {
  CONTACT_ROLE_OPTIONS,
  CONTACT_STATUS_OPTIONS,
  MESSAGES,
} from "@/lib/constants";
import { useConsole } from "@/store/console-store";
import type { Contact, ContactPersonStatus, ContactRole } from "@/types";

/**
 * Form state. Every field is a string because an empty input is "" and not
 * null, and `role` starts empty rather than on the column's default: the role
 * is a real decision about who this person is, so it is asked rather than
 * assumed. `status` is only ever read in edit mode — a contact being added is
 * active by definition, which is why the API does not accept one on create.
 */
interface Draft {
  name: string;
  nickname: string;
  role: ContactRole | "";
  status: ContactPersonStatus;
  phone: string;
  email: string;
}

function emptyDraft(): Draft {
  return {
    name: "",
    nickname: "",
    role: "",
    status: "active",
    phone: "",
    email: "",
  };
}

function draftFrom(contact: Contact): Draft {
  return {
    name: contact.name ?? "",
    nickname: contact.nickname ?? "",
    role: contact.role,
    status: contact.status,
    phone: contact.phone ?? "",
    email: contact.email ?? "",
  };
}

/** "" collapses back to null, which is what the API stores for "not given". */
const orNull = (value: string) => value.trim() || null;

export function CompanyContactForm({
  companyId,
  /** null opens a blank form; a contact opens it on that contact. */
  editing,
  onDone,
  onCancel,
}: {
  companyId: number;
  editing: Contact | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { saveCompanyContact } = useConsole();

  const [draft, setDraft] = useState<Draft>(() =>
    editing ? draftFrom(editing) : emptyDraft(),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function patch(next: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...next }));
    setError(null);
  }

  async function handleSave() {
    if (saving) return;

    if (draft.name.trim() === "") {
      setError(MESSAGES.requireContactName);
      return;
    }
    if (draft.role === "") {
      setError(MESSAGES.requireContactRole);
      return;
    }

    setSaving(true);
    try {
      const saved = await saveCompanyContact(
        companyId,
        editing?.id ?? null,
        editing
          ? {
              name: draft.name.trim(),
              nickname: orNull(draft.nickname),
              role: draft.role,
              status: draft.status,
              phone: orNull(draft.phone),
              email: orNull(draft.email),
            }
          : {
              companyId,
              name: draft.name.trim(),
              nickname: orNull(draft.nickname),
              role: draft.role,
              phone: orNull(draft.phone),
              email: orNull(draft.email),
            },
      );
      // On failure the store has already raised the toast; the form stays open
      // on what was typed so it can be sent again.
      if (saved) onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-accent-line bg-accent-soft p-4">
      <h4 className="flex items-center gap-2 font-display text-[13.5px] font-semibold text-text">
        <Icon
          name={editing ? "pencil" : "plus"}
          className="size-4 text-accent"
        />
        {editing ? "แก้ไขข้อมูลผู้ติดต่อ" : "เพิ่มผู้ติดต่อใหม่"}
      </h4>

      <div className="mt-3.5 grid gap-3.5 sm:grid-cols-2">
        <TextField
          label="ชื่อผู้ติดต่อ"
          required
          autoFocus
          value={draft.name}
          placeholder="เช่น สมชาย ใจดี"
          invalid={Boolean(error) && draft.name.trim() === ""}
          onChange={(event) => patch({ name: event.target.value })}
        />
        <TextField
          label="ชื่อเล่น"
          value={draft.nickname}
          placeholder="เช่น ชาย"
          onChange={(event) => patch({ nickname: event.target.value })}
        />

        <TextField
          label="เบอร์โทร"
          mono
          value={draft.phone}
          placeholder="เช่น 02-123-4567"
          onChange={(event) => patch({ phone: event.target.value })}
        />
        <TextField
          label="อีเมล"
          mono
          value={draft.email}
          placeholder="เช่น name@company.co.th"
          onChange={(event) => patch({ email: event.target.value })}
        />


         <SelectField
          label="ความเกี่ยวข้อง"
          value={draft.role}
          onChange={(event) =>
            patch({ role: event.target.value as ContactRole | "" })
          }
          options={[
            { value: "", label: "— เลือกความเกี่ยวข้อง —" },
            ...CONTACT_ROLE_OPTIONS,
          ]}
        />

         {editing ? (
          <SelectField
            label="สถานะ"
            value={draft.status}
            onChange={(event) =>
              patch({ status: event.target.value as ContactPersonStatus })
            }
            options={CONTACT_STATUS_OPTIONS}
          />
        ) : (
          <div className="hidden sm:block" />
        )}
      </div>

      {error ? (
        <Alert tone="error" title={error} className="mt-3.5" />
      ) : (
        <p className="mt-3 text-[12px] text-text-3">
          ต้องกรอกชื่อและเลือกความเกี่ยวข้อง
        </p>
      )}

      <div className="mt-3.5 flex flex-wrap gap-2.5">
        <Button
          variant="primary"
          icon="check"
          size="sm"
          loading={saving}
          onClick={handleSave}
        >
          {saving
            ? "กำลังบันทึก..."
            : editing
              ? "บันทึกการแก้ไข"
              : "บันทึกผู้ติดต่อ"}
        </Button>
        <Button size="sm" disabled={saving} onClick={onCancel}>
          ยกเลิก
        </Button>
      </div>
    </div>
  );
}
