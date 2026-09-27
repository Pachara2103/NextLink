"use client";

import { useState } from "react";

import { CompanyForm } from "@/components/groups/CompanyForm";
import {
  CompanyIdentity,
  GroupChip,
  LINE_GROUP_ICON,
} from "@/components/groups/GroupIdentity";
import { LinkGroupModal } from "@/components/groups/LinkGroupModal";
import { UnlinkGroupButton } from "@/components/groups/UnlinkGroupButton";
import { Button } from "@/components/ui/Button";
import { cn, lineGroupLabel } from "@/lib/utils";
import { useConsole } from "@/store/console-store";
import type { CompanyLine, PanelKey } from "@/types";

/**
 * Compact directory row — the list-layout twin of GroupCard, one company per
 * row. Same content and the same actions; see GroupCard for why the company
 * and its LINE group swapped places.
 */
export function GroupRow({
  company,
  scope,
  highlight,
}: {
  company: CompanyLine;
  scope: PanelKey;
  /** Search term, marked inside the names. */
  highlight?: string;
}) {
  const { openCompanyForm, isCompanyFormOpen, companyContacts } = useConsole();
  const [linking, setLinking] = useState(false);

  const linked = company.groupId !== null;
  const formOpen =
    company.groupId !== null && isCompanyFormOpen(scope, company.groupId);
  // Keyed by company id, so every company has its own list whether or not a
  // group points at it.
  const contacts = companyContacts[company.companyId] ?? [];
  const { label: groupName } = lineGroupLabel(company);

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
        pictureUrl={company.pictureUrl}
        alt={groupName}
        icon={linked ? LINE_GROUP_ICON : "unlink"}
      />
      <CompanyIdentity
        company={company}
        titleSize="sm"
        contacts={contacts}
        highlight={highlight}
        onCompanyClick={
          linked ? () => openCompanyForm(scope, company.groupId!) : undefined
        }
      />

      {/* จัดการผู้ติดต่อ lives on ผู้ติดต่อและบุคคลในบริษัท now — see the
          note in GroupCard. */}
      {linked ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            icon="pencil"
            size="sm"
            onClick={() => openCompanyForm(scope, company.groupId!)}
          >
            แก้ไขชื่อบริษัท
          </Button>
          <UnlinkGroupButton company={company} />
        </div>
      ) : (
        <Button
          variant="warn"
          icon="link"
          size="sm"
          onClick={() => setLinking(true)}
        >
          ผูกกลุ่มไลน์
        </Button>
      )}

      {/* A dialog, not a swap: the row keeps its place in the list while one
          is open, so nothing below it shifts under the cursor. */}
      {formOpen && company.groupId !== null && (
        <CompanyForm
          target={{
            groupId: company.groupId,
            companyId: company.companyId,
            companyTh: company.companyTh,
            companyEn: company.companyEn,
            aliases: company.aliases,
            displayName: company.displayName,
          }}
        />
      )}
      {linking && (
        <LinkGroupModal company={company} onClose={() => setLinking(false)} />
      )}
    </div>
  );
}
