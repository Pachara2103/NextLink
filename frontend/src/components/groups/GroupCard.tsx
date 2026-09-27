"use client";

import { useState } from "react";

import { CompanyForm } from "@/components/groups/CompanyForm";
import {
  AliasTags,
  ContactTags,
  GroupChip,
  Highlight,
  LINE_GROUP_ICON,
} from "@/components/groups/GroupIdentity";
import { LinkGroupModal } from "@/components/groups/LinkGroupModal";
import { UnlinkGroupButton } from "@/components/groups/UnlinkGroupButton";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { MESSAGES } from "@/lib/constants";
import {
  cn,
  companyLabel,
  formatThaiDate,
  lineGroupLabel,
} from "@/lib/utils";
import { useConsole } from "@/store/console-store";
import type { CompanyLine, PanelKey } from "@/types";

/**
 * The card face of one **company**, for the grid layout.
 *
 * It used to be a card per LINE group with the company as its caption. The two
 * have swapped: the company name is the heading and the group it is bound to
 * is the line underneath, because the page is now split by whether a company
 * has a group rather than the other way round. A company with no group is a
 * normal card here — it is what the "ยังไม่ผูกกลุ่มไลน์" section is made of —
 * so every part that reads off the group has an unbound form too: the chip
 * falls back to the unlink glyph, the caption reads "ยังไม่ได้ผูกกลุ่มไลน์",
 * and the footer offers ผูกกลุ่มไลน์ instead of the edit pair.
 *
 * `flex-1` on the spacer is what keeps every footer in a row of cards at the
 * same height however much text is above it.
 */
export function GroupCard({
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
  // The rename form is keyed by group id, so only a bound company can open it
  // from here. An unbound one is renamed after it has a group.
  const formOpen =
    company.groupId !== null && isCompanyFormOpen(scope, company.groupId);
  const contacts = companyContacts[company.companyId] ?? [];

  const { primary, secondary } = companyLabel(company);
  const { label: groupName } = lineGroupLabel(company);

  return (
    <article
      className={cn(
        "flex flex-col rounded-2xl border p-5 transition",
        linked
          ? "border-line bg-surface hover:border-text-4 hover:bg-surface-2"
          : "border-warn-line bg-warn-soft hover:bg-warn-strong",
      )}
    >
      <div className="flex items-start gap-3.5">
        {/* The group's own picture when it has one — so the chip is a face,
            not a status badge — and the chat glyph when it does not. */}
        <GroupChip
          linked={linked}
          pictureUrl={company.pictureUrl}
          alt={groupName}
          icon={linked ? LINE_GROUP_ICON : "unlink"}
        />

        <div className="min-w-0 flex-1">
          {linked ? (
            <button
              type="button"
              onClick={() => openCompanyForm(scope, company.groupId!)}
              title="แก้ไขชื่อบริษัท"
              className={cn(
                "block w-full cursor-pointer truncate text-left font-display text-[16px] font-semibold underline-offset-4 transition hover:text-accent",
                primary ? "text-text" : "italic text-text-4",
              )}
            >
              <Highlight
                text={primary ?? MESSAGES.noCompanyName}
                term={highlight}
              />
            </button>
          ) : (
            // No group means no rename form to open — the write is keyed by
            // group id — so the heading is plain text rather than a button
            // that would do nothing.
            <h3
              className={cn(
                "truncate font-display text-[16px] font-semibold",
                primary ? "text-text" : "italic text-text-4",
              )}
            >
              <Highlight
                text={primary ?? MESSAGES.noCompanyName}
                term={highlight}
              />
            </h3>
          )}

          {secondary && (
            <p className="truncate text-[12px] text-text-4">
              <Highlight text={secondary} term={highlight} />
            </p>
          )}

          <p
            className={cn(
              "mt-1 flex min-w-0 items-center gap-1.5 text-[12.5px]",
              linked ? "text-text-2" : "italic text-text-4",
            )}
          >
            <Icon
              name={linked ? LINE_GROUP_ICON : "unlink"}
              className="size-3.5 shrink-0 text-text-4"
            />
            <span className="truncate">
              <Highlight text={groupName} term={highlight} />
            </span>
          </p>
        </div>
      </div>

      {/* Aliases first, then the contacts under them — the same pair, in the
          same order, as the notes page. The contact row is held to one line
          (`fit`): a card is narrower than a row, so the names that do not fit
          are counted in its "+n" rather than wrapped, which would push this
          card's footer below its neighbours'. */}
      {(company.aliases.some((alias) => alias.trim() !== "") ||
        contacts.length > 0) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <AliasTags aliases={company.aliases} highlight={highlight} />
          <ContactTags contacts={contacts} fit highlight={highlight} />
        </div>
      )}

      {/* Eats the leftover height so every footer in the row lines up. */}
      <div className="flex-1" />

      <p className="mt-4 flex items-center gap-1.5 font-mono text-[11px] text-text-4">
        <Icon name="clock" className="size-3" />
        <span className="tabular-nums">
          {formatThaiDate(company.updatedAt)}
        </span>
      </p>

      <div className="mt-2.5 grid grid-cols-2 gap-2 border-t border-line-soft pt-3.5">
        {linked ? (
          <>
            <Button
              icon="pencil"
              size="sm"
              fullWidth
              className="min-w-0"
              onClick={() => openCompanyForm(scope, company.groupId!)}
            >
              แก้ไขชื่อบริษัท
            </Button>
            <UnlinkGroupButton company={company} className="w-full min-w-0" />
          </>
        ) : (
          <Button
            variant="warn"
            icon="link"
            size="sm"
            fullWidth
            className="col-span-2"
            onClick={() => setLinking(true)}
          >
            ผูกกลุ่มไลน์
          </Button>
        )}
      </div>

      {/* Dialogs, not swaps: the card keeps its cell in the grid while one is
          open, so the rest of the grid does not reflow around it. */}
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
    </article>
  );
}
