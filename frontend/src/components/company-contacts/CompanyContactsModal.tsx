"use client";

import { useState } from "react";

import { CompanyContactCard } from "@/components/company-contacts/CompanyContactCard";
import { CompanyContactForm } from "@/components/company-contacts/CompanyContactForm";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { CountChip } from "@/components/ui/Badge";
import { ConfirmModal, Modal } from "@/components/ui/Modal";
import { companyLabel, groupLabel } from "@/lib/utils";
import { useConsole } from "@/store/console-store";
import type { Contact, GroupLine } from "@/types";

/**
 * "จัดการผู้ติดต่อ" for one company.
 *
 * Contacts are keyed by company id, not group id, so this dialog is only
 * reachable from a group that is bound to a company — which is also why the
 * button that opens it is not offered on an unlinked one.
 *
 * At most one form is open at a time, and it takes the place of the card it is
 * editing: two open forms would mean two drafts of the same list, and there is
 * no reading of the screen that says which one wins.
 */
export function CompanyContactsModal({
  group,
  companyId,
  open,
  onClose,
}: {
  group: GroupLine;
  companyId: number;
  open: boolean;
  onClose: () => void;
}) {
  const { companyContacts, deleteCompanyContact } = useConsole();
  const contacts = companyContacts[companyId] ?? [];

  /** null = no form. { contact: null } = the blank "add" form. */
  const [form, setForm] = useState<{ contact: Contact | null } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState(false);

  const formOpen = form !== null;
  const company = companyLabel(group).primary ?? groupLabel(group);

  async function onConfirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      // deleteCompanyContact swallows its own errors into a toast, so the
      // dialog closes either way — a row that survived stays on screen.
      await deleteCompanyContact(companyId, pendingDelete.id);
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  }

  return (
    <>
      <Modal
        open={open}
        icon="users"
        maxWidth="720px"
        title="จัดการผู้ติดต่อ"
        subtitle={company}
        onClose={onClose}
        footer={
          <>
            <div className="flex w-full justify-end">
             <Button onClick={onClose}>ปิด</Button>
            </div>
          </>
          
        }
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="flex items-center gap-2 font-mono text-[10px] tracking-[0.14em] text-text-3 uppercase">
            <Icon name="users" className="size-3.5" />
            รายชื่อผู้ติดต่อ
          </span>
          <CountChip tone={contacts.length > 0 ? "contact" : "neutral"}>
            {contacts.length}
          </CountChip>
          <Button
            variant="primary"
            icon="plus"
            size="sm"
            className="ml-auto"
            // One form at a time: while the add form is open, or a card is
            // being edited, this cannot open a second draft on top of it.
            disabled={formOpen}
            onClick={() => setForm({ contact: null })}
          >
            เพิ่มผู้ติดต่อ
          </Button>
        </div>

        {/* The blank form leads the list, right under the button that opened
            it, so the new entry appears where the eye already is. */}
        {form?.contact === null && (
          <CompanyContactForm
            key="new"
            companyId={companyId}
            editing={null}
            onDone={() => setForm(null)}
            onCancel={() => setForm(null)}
          />
        )}

        {contacts.length === 0 ? (
          !formOpen && (
            <div className="rounded-xl border border-dashed border-line bg-sunken px-4 py-8 text-center">
              <Icon name="user" className="mx-auto size-6 text-text-4" />
              <p className="mt-2.5 text-[13px] text-text-2">
                ยังไม่มีผู้ติดต่อของบริษัทนี้
              </p>
              <p className="mt-1 text-[12px] text-text-4">
                กด เพิ่มผู้ติดต่อ เพื่อบันทึกคนที่ติดต่อได้ เช่น อาจารย์ รุ่นพี่ หรือศิษย์เก่า
              </p>
            </div>
          )
        ) : (
          <div className="space-y-2.5">
            {contacts.map((person) =>
              form?.contact?.id === person.id ? (
                // The edit form takes the card's place rather than opening
                // beside it, so the row being changed is never shown twice.
                <CompanyContactForm
                  key={person.id}
                  companyId={companyId}
                  editing={person}
                  onDone={() => setForm(null)}
                  onCancel={() => setForm(null)}
                />
              ) : (
                <CompanyContactCard
                  key={person.id}
                  person={person}
                  locked={formOpen}
                  onEdit={() => setForm({ contact: person })}
                  onDelete={() => setPendingDelete(person)}
                />
              ),
            )}
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={pendingDelete !== null}
        icon="trash"
        tone="danger"
        title="ลบผู้ติดต่อ"
        confirmLabel="ลบผู้ติดต่อ"
        loading={deleting}
        onConfirm={onConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      >
        ต้องการลบ{" "}
        <strong className="font-semibold text-text">
          {pendingDelete?.name}
        </strong>{" "}
        ออกจากรายชื่อผู้ติดต่อของ {company} ใช่หรือไม่? การลบไม่สามารถย้อนกลับได้
      </ConfirmModal>
    </>
  );
}
