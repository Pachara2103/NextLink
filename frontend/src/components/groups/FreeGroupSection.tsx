"use client";

import { useMemo, useState } from "react";

import { GroupAvatar } from "@/components/groups/GroupAvatar";
import { LINE_GROUP_ICON } from "@/components/groups/GroupIdentity";
import { Icon } from "@/components/icons";
import { CountChip } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SortSelect } from "@/components/ui/Field";
import { Pagination } from "@/components/ui/Pagination";
import {
  GRID_ITEMS_PER_PAGE,
  GROUP_ONLY_SORT_OPTIONS,
  ITEMS_PER_PAGE,
} from "@/lib/constants";
import { paginate, sortGroups } from "@/lib/filters";
import { cn, formatThaiDate, groupLabel } from "@/lib/utils";
import type { GroupLayout, GroupLine, SortOption } from "@/types";

/**
 * The LINE groups no company points at.
 *
 * Read-only on purpose. The two sections above it are lists of companies, and
 * every action on this page hangs off a company row — ผูกกลุ่มไลน์ is offered
 * from the company that wants a group, not from the group that wants a
 * company. So this section exists to answer one question, "what is still
 * sitting there unclaimed", and carries no buttons at all: a card with nothing
 * to press reads as information rather than as a task that failed to load.
 *
 * These are the groups the ผูกกลุ่มไลน์ dialog offers, so the count here and
 * the count in that dialog are the same number by construction.
 */
export function FreeGroupSection({
  title,
  groups,
  layout = "list",
}: {
  title: string;
  groups: GroupLine[];
  layout?: GroupLayout;
}) {
  const [sortBy, setSortBy] = useState<SortOption>("time-desc");
  const [page, setPage] = useState(1);

  // Same reset-on-layout-switch as GroupSection: a page of six is not a page
  // of five, so the page number stops meaning the same thing.
  const [lastLayout, setLastLayout] = useState<GroupLayout>(layout);
  if (lastLayout !== layout) {
    setLastLayout(layout);
    setPage(1);
  }

  const sorted = useMemo(() => sortGroups(groups, sortBy), [groups, sortBy]);
  const view = paginate(
    sorted,
    page,
    layout === "grid" ? GRID_ITEMS_PER_PAGE : ITEMS_PER_PAGE,
  );

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="font-display text-lg font-semibold text-text">
            {title}
          </h2>
          <CountChip tone={groups.length > 0 ? "unmatched" : "neutral"}>
            {groups.length}
          </CountChip>
        </div>
        <SortSelect
          label={`เรียง ${title}`}
          options={GROUP_ONLY_SORT_OPTIONS}
          value={sortBy}
          onChange={(event) => {
            setSortBy(event.target.value as SortOption);
            setPage(1);
          }}
        />
      </div>

      {groups.length === 0 ? (
        <div className="mt-3.5">
          <EmptyState
            icon="check-circle"
            tone="success"
            title="ทุกกลุ่มไลน์ถูกผูกกับบริษัทแล้ว"
            detail="ไม่มีกลุ่มไลน์ที่ยังไม่มีบริษัทเป็นเจ้าของ"
          />
        </div>
      ) : (
        <>
          <div
            className={cn(
              "mt-3.5",
              layout === "grid"
                ? "grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3"
                : "space-y-2.5",
            )}
          >
            {view.items.map((group) => (
              <FreeGroupCard key={group.groupId} group={group} />
            ))}
          </div>
          <div className="mt-4">
            <Pagination
              page={view.page}
              totalPages={view.totalPages}
              onChange={setPage}
            />
          </div>
        </>
      )}
    </section>
  );
}

/** One unclaimed group: its picture, its name, when it was last seen. */
function FreeGroupCard({ group }: { group: GroupLine }) {
  const name = groupLabel(group);

  return (
    <article className="flex items-center gap-3.5 rounded-xl border border-line bg-surface p-4">
      <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-sunken">
        <GroupAvatar
          src={group.pictureUrl}
          alt={name}
          className="size-full object-cover"
          fallback={
            <Icon name={LINE_GROUP_ICON} className="size-[18px] text-text-3" />
          }
        />
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="truncate font-display text-[15px] font-semibold text-text">
          {name}
        </h3>
        <p className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-text-4">
          <Icon name="clock" className="size-3" />
          <span className="tabular-nums">{formatThaiDate(group.updatedAt)}</span>
        </p>
      </div>
    </article>
  );
}
