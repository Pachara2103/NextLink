"use client";

import { useState } from "react";

import { ContactForm } from "@/components/contacts/ContactForm";
import { Highlight } from "@/components/groups/GroupIdentity";
import { Icon } from "@/components/icons";
import { Badge, JobTitleBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import {
  EMPLOYEE_STATUS_LABELS,
  EMPLOYEE_STATUS_TONES,
} from "@/lib/constants";
import { companyLabel, employeeName, groupLabel } from "@/lib/utils";
import type { Employee, EmployeeStatus, GroupLine } from "@/types";

/**
 * What "ค้นหาชื่อบุคคล" answers with.
 *
 * A flat list across every company, not a filtered directory: somebody
 * searching a name usually does not know which company to look under — that
 * is the whole reason they are searching — so the company is part of the
 * answer rather than the thing you had to know to ask. Each row therefore
 * carries the group it was found in, and the way into editing it, so a hit
 * never has to be chased back down the page.
 *
 * The edit form is the same one the cards use, in a dialog: the row is one
 * line and the form is fifteen, so opening it in place would bury the rest of
 * the results.
 */
export function PersonSearchResults({
  rows,
  people,
  highlight,
}: {
  /** Every company card the panel built, for looking a person's group back up. */
  rows: { group: GroupLine & { companyId: number }; people: Employee[] }[];
  /** The people that matched, in the order the search returned them. */
  people: Employee[];
  highlight?: string;
}) {
  const [editing, setEditing] = useState<Employee | null>(null);

  if (people.length === 0) {
    return (
      <EmptyState
        icon="search"
        title="ไม่พบบุคคลที่ค้นหา"
        detail="ลองใช้คำสั้นลง หรือค้นด้วยชื่อเล่นแทน"
      />
    );
  }

  /** Which company a hit belongs to. Built per render — the list is short. */
  const groupOf = new Map(
    rows.map((row) => [row.group.companyId, row.group] as const),
  );

  return (
    <>
      <ul className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line bg-sunken">
        {people.map((person) => {
          const { primary, secondary } = employeeName(person);
          const group = groupOf.get(person.companyId);
          const company = group
            ? (companyLabel(group).primary ?? groupLabel(group))
            : null;
          const statusKey = person.status as EmployeeStatus;

          return (
            <li
              key={person.id}
              className="flex flex-wrap items-center gap-3 px-3.5 py-3 transition hover:bg-surface"
            >
              <div className="grid size-9 shrink-0 place-items-center rounded-full border border-line bg-surface-2 text-text-3">
                <Icon name="user" className="size-4" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-display text-[14px] font-semibold text-text">
                    <Highlight text={primary} term={highlight} />
                  </span>
                  {secondary && (
                    <span className="truncate text-[12.5px] text-text-3">
                      <Highlight text={secondary} term={highlight} />
                    </span>
                  )}
                  {person.nickname && (
                    <span className="truncate text-[12px] text-text-4">
                      {"("}
                      <Highlight text={person.nickname} term={highlight} />
                      {")"}
                    </span>
                  )}
                  <Badge tone={EMPLOYEE_STATUS_TONES[statusKey]}>
                    {EMPLOYEE_STATUS_LABELS[statusKey]}
                  </Badge>
                  <JobTitleBadge value={person.jobTitle} />
                </div>

                {/* The company the hit was found under — the half of the
                    answer the searcher did not have. */}
                <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px] text-text-2">
                  <Icon
                    name="building"
                    className="size-3.5 shrink-0 text-text-4"
                  />
                  <span className="truncate">
                    {company ?? (
                      <span className="text-text-4 italic">
                        ไม่พบบริษัทของคนนี้
                      </span>
                    )}
                  </span>
                </p>
              </div>

              <Button
                icon="pencil"
                size="sm"
                className="ml-auto shrink-0"
                onClick={() => setEditing(person)}
              >
                แก้ไข
              </Button>
            </li>
          );
        })}
      </ul>

      {/* Mounted only while open, so the form always starts from the row that
          was clicked rather than from the one before it. */}
      {editing && (
        <Modal
          open
          icon="pencil"
          maxWidth="640px"
          title="แก้ไขข้อมูลบุคคลในบริษัท"
          subtitle={
            companyLabel(groupOf.get(editing.companyId) ?? {}).primary ??
            undefined
          }
          onClose={() => setEditing(null)}
        >
          <ContactForm
            companyId={editing.companyId}
            person={editing}
            mode="staff"
            onCancel={() => setEditing(null)}
            onDone={() => setEditing(null)}
          />
        </Modal>
      )}
    </>
  );
}
