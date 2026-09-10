"use client";

import { useState } from "react";

import {
  JobTitleField,
  jobTitleModeFor,
  type JobTitleMode,
} from "@/components/contacts/JobTitleField";
import { Alert, InlineNote } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { SelectField, TextField } from "@/components/ui/Field";
import {
  EMPLOYEE_FIELDS,
  EMPLOYEE_FIELD_LABELS,
  EMPLOYEE_STATUS_OPTIONS,
  MESSAGES,
  RELEVANT_OPTIONS,
  type EmployeeDraft,
  type EmployeeField,
} from "@/lib/constants";
import { fromDraft, hasEmployeeName, toDraft } from "@/lib/utils";
import { useConsole } from "@/store/console-store";
import type { ContactStatus, Employee, EmployeeStatus } from "@/types";

const MONO_FIELDS: EmployeeField[] = ["phone", "email"];
const REQUIRED_FIELDS: EmployeeField[] = ["nameTh", "nameEn"];

const PLACEHOLDERS: Partial<Record<EmployeeField, string>> = {
  nameTh: "เช่น สมชาย ใจดี",
  nameEn: "เช่น Somchai Jaidee",
  nickname: "เช่น ชาย",
  phone: "เช่น 02-123-4567",
  email: "เช่น name@company.co.th",
};

/** A blank draft, for the add form. Every field is a string — see EmployeeDraft. */
function emptyDraft(): EmployeeDraft {
  const draft = {} as EmployeeDraft;
  for (const field of EMPLOYEE_FIELDS) draft[field] = "";
  return draft;
}

/**
 * The one employee form, in three jobs.
 *
 * `mode` is not a styling choice — it decides which endpoint the save reaches,
 * and the three are not interchangeable:
 *
 * - `pending` edits a row still awaiting review. PostgreSQL only, because the
 *   row has no graph node yet for a second write to keep in step.
 * - `staff` edits a reviewed row, through the endpoint that writes both halves
 *   under one transaction. It is also the only mode that offers `status`: a
 *   pending row's status is not a field, it is what the approve and delete
 *   buttons are for.
 * - `create` adds a person by hand, both halves, at `active`.
 *
 * Everything above `mode` is shared on purpose. The summary page and the
 * directory page show the same seven fields with the same validation, and two
 * copies of that would drift the first time one of them gained a field.
 */
export function ContactForm({
  companyId,
  person,
  mode,
  onCancel,
  onDone,
}: {
  /** Which company the row belongs to. NOT NULL on the table, so never optional. */
  companyId: number;
  /** The row being edited; `null` opens the blank add form. */
  person: Employee | null;
  mode: "pending" | "staff" | "create";
  onCancel: () => void;
  /** Called only after the write landed. */
  onDone?: () => void;
}) {
  const { saveContact, saveEmployee, createEmployee } = useConsole();

  const [draft, setDraft] = useState<EmployeeDraft>(() =>
    person ? toDraft(person) : emptyDraft(),
  );
  // Opens on whichever of its two inputs holds the stored title — see
  // jobTitleModeFor. Held here so switching mode survives every keystroke in
  // the other fields.
  const [titleMode, setTitleMode] = useState<JobTitleMode>(() =>
    jobTitleModeFor(person?.jobTitle),
  );
  // A new person is active by definition; an edit starts from where they are.
  // `pending` never reaches this — the field is not rendered in that mode —
  // so the row keeps the status it came in with.
  const [status, setStatus] = useState<EmployeeStatus>(() =>
    person && person.status !== "pending" ? person.status : "active",
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const creating = mode === "create";
  const withStatus = mode !== "pending";

  function update(field: EmployeeField, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setError(null);
  }

  async function handleSave() {
    if (saving) return;

    if (!hasEmployeeName(draft)) {
      setError(MESSAGES.requireEmployeeName);
      return;
    }

    // The status the row is written with: its own in `pending` mode, where the
    // field is not on screen, and the picked one everywhere else.
    const nextStatus: ContactStatus =
      mode === "pending" ? (person?.status ?? "pending") : status;
    const payload = fromDraft(draft, { companyId, status: nextStatus });

    // Held until the write answers, so a second click cannot send the same
    // row twice. Each of the three raises its own toast either way, and all
    // three leave the form open on what was typed when they fail.
    setSaving(true);
    try {
      const ok = creating
        ? await createEmployee(payload)
        : mode === "staff"
          ? await saveEmployee(companyId, person!.id, payload)
          : await saveContact(companyId, person!.id, payload);
      if (ok) onDone?.();
    } finally {
      setSaving(false);
    }
  }

  // No header and no padding of its own: every caller renders this inside a
  // Modal, which already supplies the title, the close button and the frame.
  return (
    <div>
      <div className="grid gap-3.5 sm:grid-cols-2">
        {EMPLOYEE_FIELDS.map((field) => {
          // The two fields that are not plain text boxes.
          if (field === "jobTitle") {
            return (
              <JobTitleField
                key={field}
                value={draft.jobTitle}
                mode={titleMode}
                // The review form has seven fields and no status, so this one
                // takes the full-width row that squares the other six off at
                // three rows. The add/edit form has eight, which already
                // divides evenly, so here it stays inside one cell.
                layout={withStatus ? "cell" : "row"}
                onValueChange={(value) => update("jobTitle", value)}
                onModeChange={setTitleMode}
              />
            );
          }

          if (field === "relevant") {
            return (
              <SelectField
                key={field}
                label={EMPLOYEE_FIELD_LABELS[field]}
                options={RELEVANT_OPTIONS}
                value={draft[field]}
                onChange={(event) => update(field, event.target.value)}
              />
            );
          }

          return (
            <TextField
              key={field}
              label={EMPLOYEE_FIELD_LABELS[field]}
              required={REQUIRED_FIELDS.includes(field)}
              mono={MONO_FIELDS.includes(field)}
              placeholder={PLACEHOLDERS[field]}
              value={draft[field]}
              invalid={Boolean(error) && REQUIRED_FIELDS.includes(field)}
              onChange={(event) => update(field, event.target.value)}
            />
          );
        })}

        {withStatus && (
          <SelectField
            label="สถานะ"
            value={status}
            options={EMPLOYEE_STATUS_OPTIONS}
            onChange={(event) =>
              setStatus(event.target.value as EmployeeStatus)
            }
          />
        )}
      </div>

      {error ? (
        <Alert tone="error" title={error} className="mt-4" />
      ) : (
        <div className="mt-4">
          <InlineNote>
            ต้องกรอกชื่ออย่างน้อยหนึ่งภาษา (TH หรือ EN)
          </InlineNote>
        </div>
      )}

      <div className="mt-3.5 flex flex-wrap gap-2.5">
        <Button
          variant="primary"
          icon={creating ? "plus" : "check"}
          loading={saving}
          // The one hard rule, enforced on the button as well as on save: with
          // neither name filled in there is nothing to identify the row by,
          // and the table's own CHECK would refuse it.
          disabled={!hasEmployeeName(draft)}
          onClick={handleSave}
          className="flex-1 sm:max-w-[180px]"
        >
          {saving
            ? "กำลังบันทึก..."
            : creating
              ? "บันทึกบุคคลนี้"
              : "บันทึกการแก้ไข"}
        </Button>
        <Button
          disabled={saving}
          onClick={onCancel}
          className="flex-1 sm:max-w-[140px]"
        >
          ยกเลิก
        </Button>
      </div>
    </div>
  );
}
