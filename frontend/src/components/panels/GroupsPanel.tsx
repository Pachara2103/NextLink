"use client";

import { useMemo, useState } from "react";

import { GroupLayoutToggle } from "@/components/groups/GroupLayoutToggle";
import { GroupList, GroupSection } from "@/components/groups/GroupSection";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import {
  EmptyState,
  GroupCardSkeleton,
  GroupTileSkeleton,
} from "@/components/ui/EmptyState";
import { SearchInput } from "@/components/ui/Field";
import { searchGroups } from "@/lib/filters";
import { formatThaiDate } from "@/lib/utils";
import { useConsole } from "@/store/console-store";
import type { GroupLayout } from "@/types";

export function GroupsPanel() {
  const {
    groupLines,
    linkedGroups,
    unlinkedGroups,
    syncing,
    sync,
    lastSyncedAt,
  } = useConsole();

  const [term, setTerm] = useState("");
  // One choice for the whole panel — the search results and both sections all
  // read from it, so the page never shows rows and cards at the same time.
  const [layout, setLayout] = useState<GroupLayout>("grid");
  const results = useMemo(() => searchGroups(groupLines, term), [groupLines, term]);
  const searching = term.trim() !== "";

  return (
    <div>
      {/* Moved off the old topbar: refreshing the group list is this panel's
          action, so it sits beside this panel's title. */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-text">
            กลุ่มไลน์และบริษัท
          </h1>
          <p className="mt-1 text-sm text-text-2">
            จัดการความสัมพันธ์ระหว่างกลุ่มไลน์กับบริษัท
          </p>
          {/* <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-text-3">
            <Icon name="clock" className="size-3.5 text-text-4" />
            ซิงค์ล่าสุด{" "}
            <span className="font-mono tabular-nums text-text-2">
              {formatThaiDate(lastSyncedAt, true)}
            </span>
          </p> */}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <GroupLayoutToggle value={layout} onChange={setLayout} />
          <Button
            icon="refresh"
            loading={syncing === "groups"}
            disabled={syncing !== null}
            onClick={() => sync("groups")}
          >
            รีเฟรชกลุ่มไลน์
          </Button>
        </div>
      </header>

      <div className="mt-6 rounded-2xl border border-line-soft bg-surface p-4 sm:p-5">
        <SearchInput
          value={term}
          onValueChange={setTerm}
          onClear={() => setTerm("")}
          placeholder="ค้นหาด้วยชื่อกลุ่มไลน์ ชื่อบริษัท (TH / EN) หรือชื่อย่อบริษัท..."
        />

        {searching && (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <p className="text-[12.5px] text-text-2">
                พบ{" "}
                <span className="font-mono font-medium tabular-nums text-accent">
                  {results.length}
                </span>{" "}
                รายการจากคำค้น{" "}
                <span className="text-text">“{term.trim()}”</span>
              </p>
              <p className="font-mono text-[11px] text-text-4">
                ค้นในฟิลด์: display_name · company_th · company_en · aliases
              </p>
            </div>

            <div className="mt-3.5">
              {results.length === 0 ? (
                <EmptyState
                  icon="search"
                  title="ไม่พบรายการที่ค้นหา"
                  detail="ลองใช้คำสั้นลง หรือค้นด้วยชื่อบริษัทภาษาอังกฤษ / ชื่อย่อบริษัทแทน"
                />
              ) : (
                <GroupList
                  groups={results}
                  scope="groups"
                  layout={layout}
                  highlight={term}
                />
              )}
            </div>
          </>
        )}
      </div>

      {syncing ? (
        layout === "grid" ? (
          <div className="mt-8 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            <GroupTileSkeleton />
            <GroupTileSkeleton />
            <GroupTileSkeleton />
          </div>
        ) : (
          <div className="mt-8 space-y-2.5">
            <GroupCardSkeleton />
            <GroupCardSkeleton />
            <GroupCardSkeleton />
          </div>
        )
      ) : (
        <div className="mt-8 space-y-8">
          <GroupSection
            title="กลุ่มไลน์ที่ผูกบริษัทแล้ว"
            groups={linkedGroups}
            linked
            scope="groups"
            layout={layout}
          />
          <GroupSection
            title="กลุ่มไลน์ที่ยังไม่ได้ผูกบริษัท"
            groups={unlinkedGroups}
            linked={false}
            scope="groups"
            layout={layout}
          />
        </div>
      )}
    </div>
  );
}
