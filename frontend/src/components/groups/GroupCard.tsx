"use client";

import { CompanyForm } from "@/components/groups/CompanyForm";
import {
  AliasTags,
  ContactTags,
  GroupChip,
  Highlight,
} from "@/components/groups/GroupIdentity";
import { UnlinkCompanyButton } from "@/components/groups/UnlinkCompanyButton";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { MESSAGES } from "@/lib/constants";
import { cn, companyLabel, formatThaiDate, groupLabel } from "@/lib/utils";
import { useConsole } from "@/store/console-store";
import type { GroupLine, PanelKey } from "@/types";

/**
 * The card face of one group, for the grid layout.
 *
 * Same content as GroupRow and the same three actions, but stacked instead of
 * strung across a row: the identity reads top-down (badge, name, company, short
 * names, contacts) and the buttons sit on their own footer line, so every card
 * in a row lines its actions up at the same height however much text is above
 * them. That is what `flex-1` on the spacer buys — a grid of ragged cards is
 * much harder to scan than a grid of even ones.
 */
export function GroupCard({
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
  const contacts =
    group.companyId != null ? (companyContacts[group.companyId] ?? []) : [];

  const { primary, secondary } = companyLabel(group);

  return (
    <article
      className={cn(
        "flex flex-col rounded-2xl border p-5 transition",
        linked
          ? "border-line bg-surface hover:border-text-4 hover:bg-surface-2"
          : "border-warn-line bg-warn-soft hover:bg-warn-strong",
      )}
    >
      {/* Identity sits beside the chip rather than under it: the link/unlink
          glyph already says which of the two sections this card is in, so the
          status pill that used to hold this corner was repeating the heading
          above it and is gone. */}
      <div className="flex items-start gap-3.5">
        <GroupChip
          linked={linked}
          pictureUrl={group.pictureUrl}
          alt={groupLabel(group)}
        />

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => openCompanyForm(scope, group.groupId)}
            title={linked ? "แก้ไขชื่อบริษัท" : "เพิ่มชื่อบริษัท"}
            className="block w-full cursor-pointer truncate text-left font-display text-[16px] font-semibold text-text underline-offset-4 transition hover:text-accent"
          >
            <Highlight text={groupLabel(group)} term={highlight} />
          </button>

          <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[12.5px] text-text-2">
            {primary ? (
              <>
                <Icon
                  name="building"
                  className="size-3.5 shrink-0 text-text-4"
                />
                <span className="truncate">
                  <Highlight text={primary} term={highlight} />
                  {secondary ? (
                    <span className="text-text-4">
                      {" ("}
                      <Highlight text={secondary} term={highlight} />
                      {")"}
                    </span>
                  ) : (
                    <span className="text-text-4">
                      {group.companyTh
                        ? " (ไม่มีชื่อภาษาอังกฤษ)"
                        : " (ไม่มีชื่อภาษาไทย)"}
                    </span>
                  )}
                </span>
              </>
            ) : (
              <span className="truncate italic text-text-4">
                {MESSAGES.noCompanyName}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Aliases first, then the contacts under them — the same pair, in the
          same order, as the notes page. The contact row is held to one line
          (`fit`): a card is narrower than a row, so the names that do not fit
          are counted in its "+n" rather than wrapped, which would push this
          card's footer below its neighbours'. The full list is one click away
          in จัดการผู้ติดต่อ. */}
      {((group.aliases ?? []).some((alias) => alias.trim() !== "") ||
        contacts.length > 0) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <AliasTags aliases={group.aliases} highlight={highlight} />
          <ContactTags contacts={contacts} fit highlight={highlight} />
        </div>
      )}

      {/* Eats the leftover height so every footer in the row lines up. */}
      <div className="flex-1" />

      <p className="mt-4 flex items-center gap-1.5 font-mono text-[11px] text-text-4">
        <Icon name="clock" className="size-3" />
        <span className="tabular-nums">{formatThaiDate(group.updatedAt)}</span>
      </p>

  
      <div className="mt-2.5 grid grid-cols-2 gap-2 border-t border-line-soft pt-3.5">
        {linked ? (
          <>
            <Button
              icon="pencil"
              size="sm"
              fullWidth
              className="min-w-0"
              onClick={() => openCompanyForm(scope, group.groupId)}
            >
              แก้ไขชื่อบริษัท
            </Button>
            <UnlinkCompanyButton group={group} className="w-full min-w-0" />
          </>
        ) : (
          <Button
            variant="warn"
            icon="plus"
            size="sm"
            fullWidth
            className="col-span-2"
            onClick={() => openCompanyForm(scope, group.groupId)}
          >
            เพิ่มบริษัท
          </Button>
        )}
      </div>

      {/* A dialog, not a swap: the card keeps its cell in the grid while the
          form is open, so the rest of the grid does not reflow around it. */}
      {formOpen && <CompanyForm group={group} />}
    </article>
  );
}
