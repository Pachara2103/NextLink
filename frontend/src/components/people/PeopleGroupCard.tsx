"use client";

import { useState } from "react";

import { ContactCard } from "@/components/contacts/ContactCard";
import { GroupChip, GroupIdentity } from "@/components/groups/GroupIdentity";
import { ManageContactsButton } from "@/components/groups/ManageContactsButton";
import { Icon } from "@/components/icons";
import { AddPersonButton } from "@/components/people/AddPersonButton";
import { CountChip } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { useConsole } from "@/store/console-store";
import { groupLabel } from "@/lib/utils";
import type { Employee, GroupLine } from "@/types";

/**
 * One company's people, behind the same show/hide control the summary page
 * uses — and closed to begin with.
 *
 * Closed by default because a company's staff list is much taller than its
 * header, and this page lists every company at once: left open, five
 * companies of four people each is a page you have to scroll past rather than
 * read. Shut, the page is a directory of companies you open the one you want
 * from.
 *
 * Each card keeps its own open state rather than sharing the store's
 * single `viewingGroupId`, so several companies can be compared side by side
 * — and so opening one here does not quietly expand the same group over on
 * the summary page.
 *
 * The two buttons in the header are the two kinds of person a company has —
 * `employees`, the staff in the cards below, and `contacts`, the people *we*
 * know there. They are separate tables and separate dialogs, but they are the
 * same question, so they belong on the same header rather than on two
 * different pages.
 */
export function PeopleGroupCard({
  group,
  companyId,
  employees,
  highlight,
}: {
  group: GroupLine;
  /** Non-null: the panel only builds a card for a group that has a company row. */
  companyId: number;
  /** This company's reviewed staff, already ordered newest-first. */
  employees: Employee[];
  /** Search term to mark inside the group and company names. */
  highlight?: string;
}) {
  const { companyContacts } = useConsole();
  const companyPeople = companyContacts[companyId] ?? [];
  const [expanded, setExpanded] = useState(false);

  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-4 p-4 sm:p-5">
        <GroupChip
          linked={group.isLinked}
          pictureUrl={group.pictureUrl}
          alt={groupLabel(group)}
        />

        <GroupIdentity
          group={group}
          contacts={companyPeople}
          highlight={highlight}
          badges={
            <CountChip tone={employees.length > 0 ? "contact" : "neutral"}>
              {employees.length} คน
            </CountChip>
          }
        />

        <div className="flex flex-wrap items-center gap-2">
          <ManageContactsButton group={group} />
          <AddPersonButton group={group} companyId={companyId} />
          <IconButton
            icon={expanded ? "chevrons-up" : "chevrons-down"}
            label={
              expanded
                ? `ซ่อนรายชื่อบุคคลของ ${groupLabel(group)}`
                : `แสดงรายชื่อบุคคลของ ${groupLabel(group)}`
            }
            aria-expanded={expanded}
            onClick={() => setExpanded((open) => !open)}
          />
        </div>
      </div>

      {expanded && (
        <div className="border-t border-line bg-sunken p-4 sm:p-5">
          {employees.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line bg-surface px-4 py-8 text-center">
              <Icon name="user" className="mx-auto size-6 text-text-4" />
              <p className="mt-2.5 text-[13px] text-text-2">
                ยังไม่มีบุคคลในบริษัทนี้
              </p>
              <p className="mt-1 text-[12px] text-text-4">
                กด เพิ่มบุคคลในบริษัท เพื่อบันทึกเอง หรืออนุมัติรายการจากหน้า
                สรุปข้อมูลจากไลน์อัตโนมัติ
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {employees.map((person) => (
                <ContactCard
                  key={person.id}
                  companyId={companyId}
                  person={person}
                  variant="staff"
                />
              ))}
            </div>
          )}

          {/* The way back up, for a company whose list is taller than the
              screen — the header's chevron has scrolled off by then. */}
          <Button
            icon="chevrons-up"
            fullWidth
            onClick={() => setExpanded(false)}
            className="mt-4 border-line bg-surface text-text-2 hover:text-text"
          >
            ซ่อนข้อมูล
          </Button>
        </div>
      )}
    </article>
  );
}
