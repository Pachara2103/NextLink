"use client";

import { CompanyForm } from "@/components/groups/CompanyForm";
import { GroupChip, GroupIdentity } from "@/components/groups/GroupIdentity";
import { UnlinkCompanyButton } from "@/components/groups/UnlinkCompanyButton";
import { Button } from "@/components/ui/Button";
import { cn, groupLabel } from "@/lib/utils";
import { useConsole } from "@/store/console-store";
import type { GroupLine, PanelKey } from "@/types";

/**
 * Compact directory row. Same identity block as the accordion card, but no
 * expansion: this list is about the company link, not the employees.
 */
export function GroupRow({
  group,
  scope,
  highlight,
}: {
  group: GroupLine;
  scope: PanelKey;
  /** Search term, marked inside the name and company line. */
  highlight?: string;
}) {
  const { openCompanyForm, isCompanyFormOpen, companyContacts } = useConsole();
  const formOpen = isCompanyFormOpen(scope, group.groupId);
  const linked = group.isLinked;
  // Keyed by company id, so a group with no company row simply has none.
  const contacts =
    group.companyId != null ? (companyContacts[group.companyId] ?? []) : [];

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-4 rounded-xl border p-4 transition",
        linked
          ? "border-line bg-surface hover:border-text-4 hover:bg-surface-2"
          : "border-warn-line bg-warn-soft hover:bg-warn-strong",
      )}
    >
      <GroupChip
        linked={linked}
        size="sm"
        pictureUrl={group.pictureUrl}
        alt={groupLabel(group)}
      />
      <GroupIdentity
        group={group}
        titleSize="sm"
        contacts={contacts}
        highlight={highlight}
        onCompanyClick={() => openCompanyForm(scope, group.groupId)}
      />

      {/* จัดการผู้ติดต่อ lives on ผู้ติดต่อและบุคคลในบริษัท now — see the
          note in GroupCard. */}
      {linked ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            icon="pencil"
            size="sm"
            onClick={() => openCompanyForm(scope, group.groupId)}
          >
            แก้ไขชื่อบริษัท
          </Button>
          <UnlinkCompanyButton group={group} />
        </div>
      ) : (
        <Button
          variant="warn"
          icon="plus"
          size="sm"
          onClick={() => openCompanyForm(scope, group.groupId)}
        >
          เพิ่มบริษัท
        </Button>
      )}

      {/* A dialog, not a swap: the row keeps its place in the list while the
          form is open, so nothing below it shifts under the cursor. */}
      {formOpen && <CompanyForm group={group} />}
    </div>
  );
}
