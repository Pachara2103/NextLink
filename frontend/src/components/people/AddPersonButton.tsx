"use client";

import { useState } from "react";

import { ContactForm } from "@/components/contacts/ContactForm";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { companyLabel, groupLabel } from "@/lib/utils";
import type { GroupLine } from "@/types";

/**
 * "เพิ่มบุคคลในบริษัท" for one company.
 *
 * A centred dialog rather than a form that opens inside the card: the card is
 * a list of people and the form is as tall as the list, so opening it in place
 * pushes everything below it off the screen. The dialog also means the add
 * form and an edit form cannot be open at once and quietly disagree about who
 * is being written.
 *
 * Keyed by **company** id, like every other employee write, which is why this
 * button is not offered on a group with no company row — there would be
 * nothing to file the person under.
 */
export function AddPersonButton({
  group,
  companyId,
  size = "sm",
  className,
}: {
  group: GroupLine;
  companyId: number;
  size?: "sm" | "md";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const company = companyLabel(group).primary ?? groupLabel(group);

  return (
    <>
      <Button
        variant="primary"
        icon="plus"
        size={size}
        className={className}
        onClick={() => setOpen(true)}
      >
        เพิ่มบุคคลในบริษัท
      </Button>

      {/* Mounted only while open, so each visit starts from a blank draft
          rather than whatever was left behind last time. */}
      {open && (
        <Modal
          open
          icon="user"
          maxWidth="640px"
          title="เพิ่มบุคคลในบริษัท"
          subtitle={company}
          onClose={() => setOpen(false)}
        >
          <ContactForm
            companyId={companyId}
            person={null}
            mode="create"
            onCancel={() => setOpen(false)}
            onDone={() => setOpen(false)}
          />
        </Modal>
      )}
    </>
  );
}
