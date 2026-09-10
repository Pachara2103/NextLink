"use client";

import { useMemo, useState } from "react";

import { GroupAccordion } from "@/components/groups/GroupAccordion";
import { Icon } from "@/components/icons";
import { UpdateLogsModal } from "@/components/line/UpdateLogsModal";
import { Badge, CountChip } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState, GroupCardSkeleton } from "@/components/ui/EmptyState";
import { SortSelect } from "@/components/ui/Field";
import { ConfirmModal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { StatCard } from "@/components/ui/StatCard";
import { SORT_OPTIONS } from "@/lib/constants";
import { paginate, sortByUpdatedDesc, sortGroups } from "@/lib/filters";
import {
  latestErrorGroups,
  latestUpdate,
  latestUpdateAt,
  useUpdateLogs,
} from "@/lib/update-logs";
import { formatThaiDate } from "@/lib/utils";
import { useConsole } from "@/store/console-store";
import type { SortOption } from "@/types";

/**
 * The review queue, and nothing else.
 *
 * This page used to carry filter tabs across the top, because `employees.status`
 * had an `อนุมัติแล้ว` pile to switch to. It no longer does: an approval now
 * writes `active` and the person moves to ผู้ติดต่อและบุคคลในบริษัท, while a
 * decline deletes the row outright. So there is exactly one list here, and a
 * one-tab tab strip is a control that cannot be operated — it is gone, and the
 * row it sat on now just names the list and counts it.
 */
export function ContactsPanel() {
  const {
    groupLines,
    employeesOf,
    linkedGroups,
    pendingCount,
    staffCount,
    syncing,
    sync,
    serverDown,
  } = useConsole();

  // Read on mount rather than on the first press of แสดงประวัติ: the line
  // under the title is the last row of this log, so the panel needs it anyway
  // — and the dialog then opens on something already read.
  const updateLogs = useUpdateLogs();
  const lastUpdate = latestUpdate(updateLogs);
  const lastUpdatedAt = latestUpdateAt(updateLogs);
  const lastErrorGroups = latestErrorGroups(updateLogs);

  const [sortBy, setSortBy] = useState<SortOption>("time-desc");
  const [page, setPage] = useState(1);
  const [confirmingUpdate, setConfirmingUpdate] = useState(false);
  const [showingLogs, setShowingLogs] = useState(false);

  const rows = useMemo(() => {
    const withPeople = groupLines.map((group) => ({
      group,
      // Newest first inside the card, independent of how the groups themselves
      // are ordered: the row the reviewer last touched is the one they expect
      // at the top.
      people: sortByUpdatedDesc(
        employeesOf(group.companyId).filter((p) => p.status === "pending"),
      ),
    }));

    // Only the groups that actually hold something to review. A group with no
    // company and no pending row has nothing to do here; it is acted on from
    // กลุ่มไลน์และบริษัท instead.
    const filtered = withPeople.filter(({ people }) => people.length > 0);

    const order = sortGroups(
      filtered.map((row) => row.group),
      sortBy,
    );
    return order.map(
      (group) => filtered.find((row) => row.group.groupId === group.groupId)!,
    );
  }, [groupLines, employeesOf, sortBy]);

  // Same 5-row window as กลุ่มไลน์และบริษัท. Changing the sort starts over at
  // page 1, so the reviewer never lands on an empty page.
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
          <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-text-3">
            <Icon name="clock" className="size-3.5 shrink-0 text-text-4" />
            ซิงค์ล่าสุด{" "}
            <span className="font-mono tabular-nums text-text-2">
              {lastUpdatedAt === null && updateLogs.status !== "ready"
                ? "กำลังโหลด…"
                : formatThaiDate(lastUpdatedAt, true)}
            </span>
            {/* The outcome of that same run, so a failed group is seen here
                rather than only by whoever opens ประวัติการสรุปข้อมูล. A run
                with an empty errorGroups says so outright — silence would
                read the same as "not loaded yet". */}
            {lastUpdate !== null &&
              (lastErrorGroups.length === 0 ? (
                <Badge tone="matched">
                  <Icon name="check" className="size-3" />
                  สำเร็จทุกกลุ่ม
                </Badge>
              ) : (
                <>
                  <span className="text-warn">· กลุ่มที่สรุปข้อมูลไม่สําเร็จ</span>
                  {lastErrorGroups.map((name, index) => (
                    <Badge key={`${name}-${index}`} tone="unmatched">
                      <Icon name="alert" className="size-3" />
                      {name}
                    </Badge>
                  ))}
                </>
              ))}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button icon="clock" onClick={() => setShowingLogs(true)}>
            ประวัติการสรุปข้อมูล
          </Button>
          <Button
            variant="primary"
            icon="sparkles"
            loading={syncing === "all"}
            // ปิดตอนเซิร์ฟเวอร์ล่มด้วย: ปุ่มนี้เป็นทั้งการเขียนและการจ่ายเงิน
            // ค่า LLM กดตอนติดต่อไม่ได้มีแต่หมุนทิ้งแล้วจบที่ไม่รู้ผล
            disabled={syncing !== null || serverDown}
            onClick={() => setConfirmingUpdate(true)}
          >
            {syncing === "all" ? "กำลังสรุปข้อมูลจากไลน์..." : "สรุปข้อมูลจากไลน์"}
          </Button>
        </div>
      </header>

      <div className="mt-6 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <StatCard
          label="กลุ่มไลน์ทั้งหมด"
          value={groupLines.length}
          icon="users"
          footnote="กลุ่มไลน์ทั้งหมดที่มีในระบบ"
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
          footnote="กลุ่มไลน์ที่ยังไม่ได้ผูกบริษัท"
        />
        {/* Where an approved row goes, so the queue's own number is read
            against something rather than on its own. */}
        <StatCard
          label="รออนุมัติ"
          value={pendingCount}
          icon="inbox"
          tone="pending"
          footnote={`บันทึกเข้าฐานข้อมูลแล้ว ${staffCount} คน`}
        />
      </div>

      {/* What the tab strip's row became: the list says what it is and how
          much of it there is, and the sort control keeps its place on the
          right so the page's shape did not move under anyone. */}
      <div className="mt-7 flex flex-wrap items-center gap-x-3 gap-y-2.5 border-b border-line-soft pb-3">
        <div className="flex items-center gap-2.5">
          <Icon name="inbox" className="size-4 text-accent" />
          <h2 className="font-display text-[15px] font-semibold text-text">
            รายการรออนุมัติ
          </h2>
          <CountChip tone={pendingCount > 0 ? "pending" : "neutral"}>
            {pendingCount}
          </CountChip>
        </div>


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
            icon="check-circle"
            tone="success"
            title="ตรวจข้อมูลครบทุกรายการแล้ว"
            detail="ไม่มีข้อมูลรออนุมัติอยู่ กดสรุปข้อมูลจากไลน์เพื่อเริ่มอ่านข้อมูลใหม่"
          />
        ) : (
          <>
            {view.items.map(({ group, people }) => (
              <GroupAccordion
                key={group.groupId}
                group={group}
                employees={people}
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
        title="ยืนยันการสรุปข้อมูลจากไลน์"
        confirmLabel="ยืนยันและเริ่มสรุปข้อมูล"
        onConfirm={() => {
          setConfirmingUpdate(false);
          // Deliberately not awaited: the button shows its own loading state
          // and any failure surfaces as a toast.
          void sync("all");
        }}
        onCancel={() => setConfirmingUpdate(false)}
      >
        การสรุปข้อมูลจากไลน์จะให้ AI อ่านและสรุปแชทของทุกกลุ่มไลน์ที่มีข้อความใหม่ ซึ่ง
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
