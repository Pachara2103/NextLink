"use client";

import { useMemo, useState } from "react";

import { GroupCard } from "@/components/groups/GroupCard";
import { GroupRow } from "@/components/groups/GroupRow";
import { CountChip } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SortSelect } from "@/components/ui/Field";
import { Pagination } from "@/components/ui/Pagination";
import { GRID_ITEMS_PER_PAGE, ITEMS_PER_PAGE, SORT_OPTIONS } from "@/lib/constants";
import { paginate, sortGroups } from "@/lib/filters";
import type { GroupLayout, GroupLine, PanelKey, SortOption } from "@/types";

/**
 * A titled, sorted, paginated list of groups. Sort choice and page number are
 * local, so the matched and unmatched sections never affect one another.
 *
 * `layout` only changes how a page is drawn and how many fit on it — the rows
 * and the cards render the same group with the same three actions.
 */
export function GroupSection({
  title,
  groups,
  linked,
  scope,
  layout = "list",
}: {
  title: string;
  groups: GroupLine[];
  /** Which of the two sections this is — drives the count chip and the empty state. */
  linked: boolean;
  scope: PanelKey;
  layout?: GroupLayout;
}) {
  const [sortBy, setSortBy] = useState<SortOption>("time-desc");
  const [page, setPage] = useState(1);

  // A page of six is not a page of five, so the page number a reader is on
  // means something different after a switch. Back to the top rather than
  // silently landing them somewhere else in the list. Adjusted during render
  // rather than in an effect — React re-runs this component before painting,
  // so the reset never shows as a flash of the wrong page.
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
          <CountChip tone={linked ? "matched" : "unmatched"}>
            {groups.length}
          </CountChip>
        </div>
        <SortSelect
          label={`เรียง ${title}`}
          options={SORT_OPTIONS}
          value={sortBy}
          onChange={(event) => {
            setSortBy(event.target.value as SortOption);
            setPage(1);
          }}
        />
      </div>

      {groups.length === 0 ? (
        <div className="mt-3.5">
          {linked ? (
            <EmptyState
              icon="unlink"
              title="ยังไม่มีกลุ่มไลน์ที่ผูกบริษัท"
              detail="เริ่มจากผูกบริษัทให้กลุ่มในรายการด้านล่าง"
            />
          ) : (
            <EmptyState
              icon="check-circle"
              tone="success"
              title="ผูกบริษัทครบทุกกลุ่มไลน์แล้ว"
              detail="ไม่มีกลุ่มที่ค้างอยู่ในคิว"
            />
          )}
        </div>
      ) : (
        <>
          <GroupList
            groups={view.items}
            scope={scope}
            layout={layout}
            className="mt-3.5"
          />
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

/**
 * The one place that decides rows-vs-cards, so the section list and the search
 * results cannot drift apart. Three columns is the ceiling: at 2×3 = 6 per page
 * a card still has room for its short names and contact pills, and past that
 * the grid stops being scannable.
 */
export function GroupList({
  groups,
  scope,
  layout,
  highlight,
  className,
}: {
  groups: GroupLine[];
  scope: PanelKey;
  layout: GroupLayout;
  highlight?: string;
  className?: string;
}) {
  if (layout === "grid") {
    return (
      <div
        className={
          className
            ? `${className} grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3`
            : "grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3"
        }
      >
        {groups.map((group) => (
          <GroupCard
            key={group.groupId}
            group={group}
            scope={scope}
            highlight={highlight}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={className ? `${className} space-y-2.5` : "space-y-2.5"}>
      {groups.map((group) => (
        <GroupRow
          key={group.groupId}
          group={group}
          scope={scope}
          highlight={highlight}
        />
      ))}
    </div>
  );
}
