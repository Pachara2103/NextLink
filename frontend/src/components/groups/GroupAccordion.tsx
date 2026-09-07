"use client";

import { ContactCard } from "@/components/contacts/ContactCard";
import { CompanyForm } from "@/components/groups/CompanyForm";
import { GroupChip, GroupIdentity } from "@/components/groups/GroupIdentity";
import { ManageContactsButton } from "@/components/groups/ManageContactsButton";
import { UnlinkCompanyButton } from "@/components/groups/UnlinkCompanyButton";
import { Icon } from "@/components/icons";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { cn, formatThaiDate, groupLabel } from "@/lib/utils";
import { useConsole } from "@/store/console-store";
import type { Coordinator, GroupLine } from "@/types";

/**
 * One group as an expandable card. A group with no confirmed company cannot be
 * expanded, because the graph write matches on the Company node. The original
 * simply omitted the button; here the control is disabled and the reason is
 * spelled out.
 */
export function GroupAccordion({
  group,
  contacts,
}: {
  group: GroupLine;
  contacts: Coordinator[];
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
  const pending = contacts.filter((p) => p.status === "pending").length;
  const allDone = contacts.length > 0 && pending === 0;
  // The company's own contacts — a different thing from `contacts` above,
  // which is this group's extracted coordinators.
  const companyPeople =
    group.companyId != null ? (companyContacts[group.companyId] ?? []) : [];

  return (
    <article
      className={cn(
        "overflow-hidden rounded-2xl border transition",
        formOpen && "border-accent-line bg-accent-soft",
        !formOpen && linked && !allDone && "border-line bg-surface",
        !formOpen && linked && allDone && "border-line-soft bg-surface",
        !formOpen && !linked && "border-warn-line bg-warn-soft",
      )}
    >
      <div className="flex flex-wrap items-center gap-4 p-4 sm:p-5">
            <GroupChip
              linked={linked}
              dim={allDone}
              pictureUrl={group.pictureUrl}
              alt={groupLabel(group)}
            />

            <GroupIdentity
              group={group}
              muted={allDone}
              contacts={companyPeople}
              onCompanyClick={() => openCompanyForm("contacts", group.groupId)}
              badges={
                <>
                  {/* <Badge tone={linked ? "matched" : "unmatched"} dot>
                    {linked ? "ผูกบริษัทแล้ว" : "ยังไม่ได้ผูกบริษัท"}
                  </Badge> */}
                  {pending > 0 && linked && (
                    <Badge tone="pending">{pending} รออนุมัติ</Badge>
                  )}
                  {pending > 0 && !linked && (
                    <Badge tone="neutral">{pending} รออนุมัติ</Badge>
                  )}
                  {allDone && (
                    <Badge tone="neutral">
                      อนุมัติแล้ว {contacts.length} คน
                    </Badge>
                  )}
                </>
              }
            />

            <div className="flex flex-wrap items-center gap-2">
              

              {linked ? (
                <>
                  <ManageContactsButton group={group} />
                  <Button
                    icon="pencil"
                    size="sm"
                    onClick={() => openCompanyForm("contacts", group.groupId)}
                  >
                    
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
              <Icon
                name="info"
                className="mt-0.5 size-4 shrink-0 text-warn"
              />
              <p className="text-[12.5px] leading-relaxed text-warn">
                มีข้อมูลผู้ประสานงาน {pending} รายการรออนุมัติอยู่ จำเป็นต้องผูกกลุ่มนี้กับบริษัทก่อน จึงจะเปิดดูและอนุมัติได้
              </p>
            </div>
          )}

          {expanded && (
            <div className="border-t border-line bg-sunken p-4 sm:p-5">
              {/* <div className="mb-3.5 flex items-center gap-2">
                <Icon name="users" className="size-4 text-text-3" />
                <span className="font-mono text-[10px] tracking-[0.14em] text-text-3 uppercase">
                  ผู้ประสานงานในกลุ่มนี้ · {contacts.length} คน
                </span>
              </div> */}

              {contacts.length === 0 ? (
                <p className="py-4 text-center text-[13px] text-text-3">
                  ยังไม่มีผู้ประสานงานที่ AI สรุปได้จากกลุ่มนี้
                </p>
              ) : (
                <div className="space-y-3">
                  {contacts.map((person) => (
                    <ContactCard
                      key={person.id}
                      groupId={group.groupId}
                      person={person}
                      groupLinked={linked}
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
          coordinator list while the company form is open. */}
      {formOpen && <CompanyForm group={group} />}
    </article>
  );
}
