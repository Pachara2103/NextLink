"use client";

import { useState } from "react";

import { ContactForm } from "@/components/contacts/ContactForm";
import { Icon, type IconName } from "@/components/icons";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { Badge, JobTitleBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmModal, Modal } from "@/components/ui/Modal";
import {
  EMPLOYEE_FIELD_LABELS,
  EMPLOYEE_STATUS_LABELS,
  EMPLOYEE_STATUS_TONES,
  RELEVANT_LABELS,
  type EmployeeField,
} from "@/lib/constants";
import {
  cn,
  employeeName,
  formatThaiDate,
  isBlank,
  missingFieldCount,
} from "@/lib/utils";
import { useConsole } from "@/store/console-store";
import type { Employee, EmployeeStatus } from "@/types";

/**
 * The fields shown in the summary grid, with the icon each one carries.
 *
 * `relevant` is one of them now. It used to sit in the header as a lone tag
 * beside the name, which made it look like a property of the row rather than
 * one of the person's details — and left the header carrying three different
 * kinds of chip at once. It is a field like the rest, so it reads as one.
 */
const DETAIL_FIELDS: { field: EmployeeField; icon: IconName; mono?: boolean }[] =
  [
    { field: "nickname", icon: "user" },
    { field: "jobTitle", icon: "briefcase" },
    { field: "phone", icon: "phone", mono: true },
    { field: "email", icon: "mail", mono: true },
    { field: "relevant", icon: "tag" },
  ];

/**
 * One employee, in two jobs.
 *
 * Both keep their actions in the card's top-right corner, in the same order:
 * when the row last changed, the buttons, then a ⋮ menu holding ลบข้อมูล —
 * one press away rather than sitting under the cursor of someone working down
 * a list.
 *
 * `pending`: a row awaiting review, on the summary page. ยืนยันและบันทึก and
 * แก้ไข.
 *
 * `staff`: a row that has been reviewed, on the directory page. แก้ไข only,
 * because there is nothing left to approve.
 */
export function ContactCard({
  companyId,
  person,
  variant = "pending",
}: {
  companyId: number;
  person: Employee;
  variant?: "pending" | "staff";
}) {
  const {
    editingContactId,
    startContactEdit,
    cancelContactEdit,
    confirmContact,
    declineContact,
    deleteEmployee,
  } = useConsole();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

  const staff = variant === "staff";

  // The approval is a graph write, so the button has to say it is working and
  // stop taking clicks — the same contract CompanyForm's ยืนยัน button keeps.
  async function onConfirm() {
    if (saving) return;
    setSaving(true);
    try {
      await confirmContact(companyId, person.id);
    } finally {
      // On success the row leaves this list and this never shows again; on
      // failure confirmContact has raised its toast and the button must come
      // back so the reviewer can try again.
      setSaving(false);
    }
  }

  async function onDelete() {
    setDeleting(true);
    // Both swallow their own errors into a toast, so the dialog closes either
    // way — a row the API refused to delete stays on screen.
    if (staff) await deleteEmployee(companyId, person.id);
    else await declineContact(companyId, person.id);
    setDeleting(false);
    setConfirmingDelete(false);
  }

  const { primary, secondary } = employeeName(person);
  const editing = editingContactId === person.id;
  const missing = missingFieldCount(person);
  const reviewed = person.status !== "pending";
  const statusKey = person.status as EmployeeStatus;

  return (
    <div
      className={cn(
        "rounded-xl border bg-surface p-4",
        reviewed && person.status !== "active"
          ? "border-line-soft"
          : "border-line",
      )}
    >
      <div className="flex flex-wrap items-center gap-3.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-display text-[15px] font-semibold text-text">
              {primary}
            </h4>
            {secondary && (
              <span className="text-[13px] text-text-3">{secondary}</span>
            )}
            {reviewed ? (
              <Badge tone={EMPLOYEE_STATUS_TONES[statusKey]}>
                {EMPLOYEE_STATUS_LABELS[statusKey]}
              </Badge>
            ) : (
              <Badge tone="pending" className="uppercase">
                รออนุมัติ
              </Badge>
            )}
            {/* One colour per job title, so a company's coordinators can be
                picked out of a long card without reading every line. */}
            <JobTitleBadge value={person.jobTitle} />
            {missing > 0 && !staff && (
              <Badge tone="unmatched">ขาดข้อมูล {missing} ช่อง</Badge>
            )}
          </div>
        </div>

        {/* Every action the card has, in its corner, in the order they are
            reached for: when the row last changed, then the buttons, then the
            ⋮ that holds the one press nobody can take back. Both variants are
            laid out the same way so moving between the two pages does not
            move the controls. */}
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-[12px] tabular-nums text-text-3 mr-3">
            <Icon name="clock" className="size-3.5" />
            {staff ? "แก้ไขล่าสุด" : "เข้ามาเมื่อ"}{" "}
            {formatThaiDate(person.updatedAt)}
          </span>

          {!staff && (
            <Button
              variant="primary"
              icon="check"
              size="sm"
              loading={saving}
              onClick={onConfirm}
            >
              {saving ? "กำลังบันทึก..." : "ยืนยันและบันทึก"}
            </Button>
          )}

          <Button
            icon="pencil"
            size="sm"
            disabled={saving}
            onClick={() => startContactEdit(person.id)}
          >
            แก้ไข
          </Button>

          <ActionMenu
            label={`ตัวเลือกเพิ่มเติมของ ${primary}`}
            disabled={saving}
            items={[
              {
                icon: "trash",
                label: "ลบข้อมูล",
                tone: "danger",
                onSelect: () => setConfirmingDelete(true),
              },
            ]}
          />
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-x-4 gap-y-3.5 border-t border-line pt-4 sm:grid-cols-3 lg:grid-cols-5">
        {DETAIL_FIELDS.map(({ field, icon, mono }) => {
          const raw = person[field];
          const blank = isBlank(raw);
          // relevant is a closed enum stored by value, so the card has to show
          // its label — the raw "internship" is not what anyone calls it.
          const shown =
            field === "relevant" && !blank
              ? RELEVANT_LABELS[raw as keyof typeof RELEVANT_LABELS]
              : raw;

          return (
            <div key={field} className="flex min-w-0 items-center gap-2">
              {/* Down from size-7: at five columns the glyph was taking room
                  the value needs, and a 16px icon still anchors a two-line
                  label/value stack. */}
              <Icon name={icon} className="size-6.5 shrink-0 text-text-4" />
              <div className="min-w-0">
                <dt className="font-mono text-[10px] tracking-[0.12em] text-text-3 uppercase">
                  {EMPLOYEE_FIELD_LABELS[field]}
                </dt>
                {blank ? (
                  <dd className="truncate text-[13px] text-text-4 italic">
                    ไม่มีข้อมูล
                  </dd>
                ) : (
                  <dd
                    // A long email still truncates on a narrow window, so the
                    // full value stays reachable on hover.
                    title={String(shown)}
                    className={cn(
                      "truncate text-text",
                      mono
                        ? "font-mono text-[13px] tabular-nums"
                        : "text-[13.5px]",
                    )}
                  >
                    {shown}
                  </dd>
                )}
              </div>
            </div>
          );
        })}
      </dl>

     
      {editing && (
        <Modal
          open
          icon="pencil"
          maxWidth="640px"
          title={
            staff ? "แก้ไขข้อมูลบุคคลในบริษัท" : "แก้ไขข้อมูลผู้ประสานงาน"
          }
          subtitle={primary}
          onClose={cancelContactEdit}
        >
      
          <ContactForm
            companyId={companyId}
            person={person}
            mode={staff ? "staff" : "pending"}
            onCancel={cancelContactEdit}
          />
        </Modal>
      )}

      <ConfirmModal
        open={confirmingDelete}
        icon="trash"
        tone="danger"
        title={staff ? "ลบบุคคลในบริษัท" : "ลบข้อมูลผู้ประสานงาน"}
        confirmLabel="ลบข้อมูล"
        loading={deleting}
        onConfirm={onDelete}
        onCancel={() => setConfirmingDelete(false)}
      >
        ต้องการลบ <strong className="font-semibold text-text">{primary}</strong>{" "}
        {staff
          ? "ออกจากรายชื่อบุคคลในบริษัทใช่หรือไม่? การลบไม่สามารถย้อนกลับได้"
          : "ออกจากรายการรออนุมัติใช่หรือไม่?"}
      </ConfirmModal>
    </div>
  );
}
