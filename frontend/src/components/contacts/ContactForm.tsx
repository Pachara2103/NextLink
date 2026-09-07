"use client";

import { useState } from "react";

import { Icon } from "@/components/icons";
import { Alert, InlineNote } from "@/components/ui/Alert";
import { Button, CloseButton } from "@/components/ui/Button";
import { SelectField, TextField } from "@/components/ui/Field";
import {
  COORDINATOR_FIELDS,
  COORDINATOR_FIELD_LABELS,
  MESSAGES,
  RELEVANT_OPTIONS,
  type CoordinatorField,
} from "@/lib/constants";
import { fromDraft, hasCoordinatorName, toDraft } from "@/lib/utils";
import { useConsole } from "@/store/console-store";
import type { Coordinator } from "@/types";

const MONO_FIELDS: CoordinatorField[] = ["phone", "email"];
const REQUIRED_FIELDS: CoordinatorField[] = ["nameTh", "nameEn"];

const PLACEHOLDERS: Partial<Record<CoordinatorField, string>> = {
  phone: "เช่น 02-123-4567",
  email: "เช่น name@company.co.th",
  jobTitle: "เช่น HR Manager",
};

/**
 * Seven fields in a two-column grid, in the order declared by
 * COORDINATOR_FIELDS. The trailing cell is left empty because the count is odd.
 */
export function ContactForm({
  groupId,
  person,
}: {
  groupId: string;
  person: Coordinator;
}) {
  const { saveContact, cancelContactEdit } = useConsole();
  const [draft, setDraft] = useState(() => toDraft(person));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function update(field: CoordinatorField, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setError(null);
  }

  async function handleSave() {
    if (saving) return;

    if (!hasCoordinatorName(draft)) {
      setError(MESSAGES.requireCoordinatorName);
      return;
    }

    // The write is async now: hold the button until it answers, so a second
    // click cannot send the same edit twice. saveContact raises its own toast
    // either way, and leaves the form open when it fails.
    setSaving(true);
    try {
      await saveContact(groupId, person.id, fromDraft(draft));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="flex items-center gap-2 font-display text-sm font-semibold text-text">
          <Icon name="pencil" className="size-4 text-accent" />
          แก้ไขข้อมูลผู้ประสานงาน
        </h4>
        <CloseButton onClick={cancelContactEdit} disabled={saving} />
      </div>

      <div className="mt-4 grid gap-3.5 sm:grid-cols-2">
        {COORDINATOR_FIELDS.map((field) =>
          field === "relevant" ? (
            <SelectField
              key={field}
              label={COORDINATOR_FIELD_LABELS[field]}
              options={RELEVANT_OPTIONS}
              value={draft[field]}
              onChange={(event) => update(field, event.target.value)}
            />
          ) : (
            <TextField
              key={field}
              label={COORDINATOR_FIELD_LABELS[field]}
              required={REQUIRED_FIELDS.includes(field)}
              mono={MONO_FIELDS.includes(field)}
              placeholder={PLACEHOLDERS[field]}
              value={draft[field]}
              invalid={Boolean(error) && REQUIRED_FIELDS.includes(field)}
              onChange={(event) => update(field, event.target.value)}
            />
          ),
        )}
        <div className="hidden sm:block" />
      </div>

      {error ? (
        <Alert tone="error" title={error} className="mt-4" />
      ) : (
        <div className="mt-4">
          <InlineNote>
            ต้องกรอกชื่อผู้ประสานงานอย่างน้อยหนึ่งภาษา (TH หรือ EN)
          </InlineNote>
        </div>
      )}

      <div className="mt-3.5 flex flex-wrap gap-2.5">
        <Button
          variant="primary"
          loading={saving}
          onClick={handleSave}
          className="flex-1 sm:max-w-[180px]"
        >
          {saving ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
        </Button>
        <Button
          disabled={saving}
          onClick={cancelContactEdit}
          className="flex-1 sm:max-w-[140px]"
        >
          ยกเลิก
        </Button>
      </div>
    </div>
  );
}
