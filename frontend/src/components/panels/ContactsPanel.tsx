"use client";

import { useMemo, useState } from "react";

import { GroupAccordion } from "@/components/groups/GroupAccordion";
import { Icon } from "@/components/icons";
import { UpdateLogsModal } from "@/components/line/UpdateLogsModal";
import { Button } from "@/components/ui/Button";
import { EmptyState, GroupCardSkeleton } from "@/components/ui/EmptyState";
import { SortSelect } from "@/components/ui/Field";
import { ConfirmModal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { FilterTabs } from "@/components/ui/SegmentedControl";
import { StatCard } from "@/components/ui/StatCard";
import { SORT_OPTIONS } from "@/lib/constants";
import { paginate, sortByUpdatedDesc, sortGroups } from "@/lib/filters";
import { latestUpdateAt, useUpdateLogs } from "@/lib/update-logs";
import { formatThaiDate } from "@/lib/utils";
import { useConsole } from "@/store/console-store";
import type { ContactStatus, SortOption } from "@/types";

/**
 * The tabs, with pending first. `declined` is a coordinators.status the store
 * still counts and ContactCard still writes, but nobody reviews that pile, so
 * it is not one of the tabs.
 */
type Filter = Extract<ContactStatus, "pending" | "approved">;

const FILTER_LABELS: Record<Filter, string> = {
  pending: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
};

export function ContactsPanel() {
  const {
    groupLines,
    contacts,
    linkedGroups,
    pendingCount,
    completedCount,
    statusCounts,
    syncing,
    sync,
  } = useConsole();

  // Read on mount rather than on the first press of แสดงประวัติ: the line
  // under the title is the last row of this log, so the panel needs it anyway
  // — and the dialog then opens on something already read.
  const updateLogs = useUpdateLogs();
  const lastUpdatedAt = latestUpdateAt(updateLogs);

  const [filter, setFilter] = useState<Filter>("pending");
  const [sortBy, setSortBy] = useState<SortOption>("time-desc");
  const [page, setPage] = useState(1);
  const [confirmingUpdate, setConfirmingUpdate] = useState(false);
  const [showingLogs, setShowingLogs] = useState(false);

  const rows = useMemo(() => {
    // Each tab shows only the rows in that state, so a coordinator moves out of
    // รออนุมัติ and into อนุมัติแล้ว the moment it is approved.
    const withContacts = groupLines.map((group) => ({
      group,
      // Newest first inside the card, independent of how the groups themselves
      // are ordered: the row the reviewer last touched is the one they expect
      // at the top.
      people: sortByUpdatedDesc(
        (contacts[group.groupId] ?? []).filter((p) => p.status === filter),
      ),
    }));

    // Every tab, รออนุมัติ included, lists only the groups that actually hold a
    // row in that state. A group with no company and no pending coordinator has
    // nothing to review here; it is acted on from กลุ่มไลน์และบริษัท instead.
    const filtered = withContacts.filter(({ people }) => people.length > 0);

    const order = sortGroups(
      filtered.map((row) => row.group),
      sortBy,
    );
    return order.map(
      (group) => filtered.find((row) => row.group.groupId === group.groupId)!,
    );
  }, [groupLines, contacts, filter, sortBy]);

  // Same 5-row window as กลุ่มไลน์และบริษัท. Switching tab or sort starts over
  // at page 1, so the reviewer never lands on an empty page.
  const view = paginate(rows, page);

  const linkedRatio =
    groupLines.length === 0
      ? 0
      : Math.round((linkedGroups.length / groupLines.length) * 100);

  return (
    <div>
      {/* The two actions that used to live in the topbar. They belong to this
          panel — an update pass is what fills this list — so they sit beside
          its title, the same way เพิ่มโน้ต sits beside the notes title. */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-text">
            สรุปข้อมูลจากไลน์อัตโนมัติ
          </h1>
          <p className="mt-1 text-sm text-text-2">
            ตรวจและยืนยันข้อมูลที่ AI สรุปมาจากแต่ละกลุ่มไลน์ ก่อนบันทึกเข้าฐานข้อมูล
          </p>
          <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-text-3">
            <Icon name="clock" className="size-3.5 text-text-4" />
            ซิงค์ล่าสุด{" "}
            <span className="font-mono tabular-nums text-text-2">
              {lastUpdatedAt === null && updateLogs.status !== "ready"
                ? "กำลังโหลด…"
                : formatThaiDate(lastUpdatedAt, true)}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button icon="clock" onClick={() => setShowingLogs(true)}>
            แสดงประวัติการอัปเดตข้อมูล
          </Button>
          <Button
            variant="primary"
            icon="sparkles"
            loading={syncing === "all"}
            disabled={syncing !== null}
            onClick={() => setConfirmingUpdate(true)}
          >
            {syncing === "all" ? "กำลังวิเคราะห์ข้อมูล..." : "อัปเดตข้อมูล"}
          </Button>
        </div>
      </header>

      <div className="mt-6 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <StatCard
          label="กลุ่มไลน์ทั้งหมด"
          value={groupLines.length}
          icon="users"
          footnote={`มีข้อมูลผู้ประสานงาน ${Object.keys(contacts).length} กลุ่ม`}
        />
        <StatCard
          label="ผูกบริษัทแล้ว"
          value={linkedGroups.length}
          icon="link"
          tone="matched"
          progress={linkedRatio}
        />
        <StatCard
          label="ยังไม่ได้ผูกบริษัท"
          value={groupLines.length - linkedGroups.length}
          icon="unlink"
          tone="unmatched"
          footnote="ต้องผูกก่อนจึงดูผู้ประสานงานได้"
        />
        <StatCard
          label="รออนุมัติ"
          value={pendingCount}
          icon="inbox"
          tone="pending"
          footnote={`อนุมัติแล้ว ${completedCount} คน`}
        />
      </div>

      <div className="mt-7 flex flex-wrap items-center gap-3">
        <FilterTabs
          value={filter}
          onChange={(next) => {
            setFilter(next);
            setPage(1);
          }}
          options={(Object.keys(FILTER_LABELS) as Filter[]).map((key) => ({
            value: key,
            label: FILTER_LABELS[key],
            count: statusCounts[key],
          }))}
        />
        <div className="ml-auto flex items-center gap-2">
          <span className="font-mono text-[10px] tracking-[0.14em] text-text-4 uppercase">
            เรียงตาม
          </span>
          <SortSelect
            label="เรียงรายการกลุ่มไลน์"
            options={SORT_OPTIONS}
            value={sortBy}
            onChange={(event) => {
              setSortBy(event.target.value as SortOption);
              setPage(1);
            }}
          />
        </div>
      </div>

      <div className="mt-4 space-y-3.5">
        {syncing === "all" || syncing === "initial" ? (
          <>
            <GroupCardSkeleton />
            <GroupCardSkeleton />
            <GroupCardSkeleton />
          </>
        ) : rows.length === 0 ? (
          <EmptyState
            icon="inbox"
            title={`ไม่มีรายการใน "${FILTER_LABELS[filter]}"`}
            detail={
              filter === "pending"
                ? "กด อัปเดตข้อมูล ที่มุมขวาบน เพื่อให้ AI ดึงและสรุปข้อมูลจากกลุ่มไลน์"
                : "ลองสลับไปแท็บอื่นเพื่อดูรายการในสถานะนั้น"
            }
          />
        ) : (
          <>
            {view.items.map(({ group, people }) => (
              <GroupAccordion
                key={group.groupId}
                group={group}
                contacts={people}
              />
            ))}
            <Pagination
              page={view.page}
              totalPages={view.totalPages}
              onChange={setPage}
            />
          </>
        )}
      </div>

      <ConfirmModal
        open={confirmingUpdate}
        icon="sparkles"
        tone="warn"
        title="ยืนยันการอัปเดตข้อมูล"
        confirmLabel="อัปเดตข้อมูล"
        onConfirm={() => {
          setConfirmingUpdate(false);
          // Deliberately not awaited: the button shows its own loading state
          // and any failure surfaces as a toast.
          void sync("all");
        }}
        onCancel={() => setConfirmingUpdate(false)}
      >
        การอัปเดตข้อมูลจะให้ AI อ่านและสรุปแชทของทุกกลุ่มไลน์ที่มีข้อความใหม่ ซึ่ง
        <strong className="font-semibold text-warn">
          มีค่าใช้จ่ายตามจำนวนข้อความ
        </strong>{" "}
        กรุณากดเมื่อจำเป็นเท่านั้น
      </ConfirmModal>

      {/* Mounted only while open; the log itself is cached in lib/update-logs
          so a reopen costs nothing and รีเฟรชประวัติ is what asks again. */}
      {showingLogs && <UpdateLogsModal onClose={() => setShowingLogs(false)} />}
    </div>
  );
}
