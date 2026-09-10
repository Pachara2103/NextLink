"use client";

import { ContactCard } from "@/components/contacts/ContactCard";
import { CompanyForm } from "@/components/groups/CompanyForm";
import { GroupChip, GroupIdentity } from "@/components/groups/GroupIdentity";
import { UnlinkCompanyButton } from "@/components/groups/UnlinkCompanyButton";
import { Icon } from "@/components/icons";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { cn, groupLabel } from "@/lib/utils";
import { useConsole } from "@/store/console-store";
import type { Employee, GroupLine } from "@/types";

/**
 * One group's pending queue as an expandable card. A group with no confirmed
 * company cannot be expanded, because the graph write matches on the Company
 * node. The original simply omitted the button; here the control is disabled
 * and the reason is spelled out.
 *
 * Everything reaching this card is `pending` — the panel above filters on it
 * — so the badges no longer have to say which pile a row is in. The one thing
 * worth counting is how many are waiting.
 */
export function GroupAccordion({
  group,
  employees,
}: {
  group: GroupLine;
  /** This group's pending employees, newest first. */
  employees: Employee[];
}) {
  const {
    viewingGroupId,
    toggleView,
    openCompanyForm,
    isCompanyFormOpen,
    companyContacts,
  } = useConsole();

  const expanded = viewingGroupId === group.groupId;
  const formOpen = isCompanyFormOpen("contacts", group.groupId);
  const linked = group.isLinked;
  const pending = employees.length;
  // The company's own contacts — a different thing from `employees` above,
  // which is this group's extracted people.
  const companyPeople =
    group.companyId != null ? (companyContacts[group.companyId] ?? []) : [];

  return (
    <article
      className={cn(
        "overflow-hidden rounded-2xl border transition",
        formOpen && "border-accent-line bg-accent-soft",
        !formOpen && linked && "border-line bg-surface",
        !formOpen && !linked && "border-warn-line bg-warn-soft",
      )}
    >
      <div className="flex flex-wrap items-center gap-4 p-4 sm:p-5">
        <GroupChip
          linked={linked}
          pictureUrl={group.pictureUrl}
          alt={groupLabel(group)}
        />

        <GroupIdentity
          group={group}
          contacts={companyPeople}
          onCompanyClick={() => openCompanyForm("contacts", group.groupId)}
          badges={
            pending > 0 && (
              <Badge tone={linked ? "pending" : "neutral"}>
                {pending} รออนุมัติ
              </Badge>
            )
          }
        />

        <div className="flex flex-wrap items-center gap-2">
          {linked ? (
            <>
              <Button
                icon="pencil"
                size="sm"
                title="แก้ไขชื่อบริษัท"
                aria-label="แก้ไขชื่อบริษัท"
                onClick={() => openCompanyForm("contacts", group.groupId)}
              >
                แก้ไขชื่อบริษัท
              </Button>
              <UnlinkCompanyButton group={group} />
            </>
          ) : (
            <Button
              variant="warn"
              icon="plus"
              onClick={() => openCompanyForm("contacts", group.groupId)}
            >
              เพิ่มบริษัท
            </Button>
          )}

          <IconButton
            icon={expanded ? "chevrons-up" : "chevrons-down"}
            label={
              linked
                ? expanded
                  ? "ซ่อนข้อมูลผู้ประสานงาน"
                  : "ดูข้อมูลผู้ประสานงาน"
                : "ต้องผูกบริษัทก่อนจึงดูข้อมูลผู้ประสานงานได้"
            }
            disabled={!linked}
            aria-expanded={linked ? expanded : undefined}
            onClick={() => toggleView(group.groupId)}
          />
          
        </div>
      </div>

      {!linked && pending > 0 && (
        <div className="flex items-start gap-2.5 border-t border-warn-line bg-warn-soft px-4 py-3 sm:px-5">
          <Icon name="info" className="mt-0.5 size-4 shrink-0 text-warn" />
          <p className="text-[12.5px] leading-relaxed text-warn">
            มีข้อมูลผู้ประสานงาน {pending} รายการรออนุมัติอยู่ จำเป็นต้องผูกกลุ่มนี้กับบริษัทก่อน
            จึงจะเปิดดูและอนุมัติได้
          </p>
        </div>
      )}

      {expanded && (
        <div className="border-t border-line bg-sunken p-4 sm:p-5">
          {employees.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-text-3">
              ยังไม่มีผู้ประสานงานที่ AI สรุปได้จากกลุ่มนี้
            </p>
          ) : (
            <div className="space-y-3">
              {/* companyId is non-null here: the card is only expandable on a
                  linked group, and a linked group has a company row. */}
              {employees.map((person) => (
                <ContactCard
                  key={person.id}
                  companyId={person.companyId}
                  person={person}
                />
              ))}
            </div>
          )}

          <Button
            icon="chevrons-up"
            fullWidth
            onClick={() => toggleView(group.groupId)}
            className="mt-4 border-line bg-surface text-text-2 hover:text-text"
          >
            ซ่อนข้อมูล
          </Button>
        </div>
      )}

      {/* A dialog, not a swap: the card keeps its place and its expanded
          employee list while the company form is open. */}
      {formOpen && <CompanyForm group={group} />}
    </article>
  );
}
