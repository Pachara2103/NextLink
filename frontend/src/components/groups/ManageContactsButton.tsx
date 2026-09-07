"use client";

import { useState } from "react";

import { CompanyContactsModal } from "@/components/company-contacts/CompanyContactsModal";
import { Button } from "@/components/ui/Button";
import { useConsole } from "@/store/console-store";
import type { GroupLine } from "@/types";


export function ManageContactsButton({
  group,
  size = "sm",
  className,
}: {
  group: GroupLine;
  size?: "sm" | "md";
  /** Lets a card footer stretch the button across the row it shares. */
  className?: string;
}) {
  const { companyContacts } = useConsole();
  const [open, setOpen] = useState(false);

  const companyId = group.companyId;
  if (companyId === null || companyId === undefined) return null;

  const count = (companyContacts[companyId] ?? []).length;

  return (
    <>
      <Button
        icon="users"
        size={size}
        className={className}
        onClick={() => setOpen(true)}
      >
        
        {/* {count > 0 && (
          <span className="font-mono text-[11px] tabular-nums text-text-2">
            {count}
          </span>
        )} */}
        จัดการผู้ติดต่อ
      </Button>

      {/* Mounted only while open, so each visit starts from a closed form and
          a fresh draft rather than whatever was left behind last time. */}
      {open && (
        <CompanyContactsModal
          group={group}
          companyId={companyId}
          open
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
