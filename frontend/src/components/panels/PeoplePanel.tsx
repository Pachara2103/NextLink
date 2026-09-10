"use client";

import { useMemo, useState } from "react";

import { Icon } from "@/components/icons";
import { PeopleGroupCard } from "@/components/people/PeopleGroupCard";
import { PersonSearchResults } from "@/components/people/PersonSearchResults";
import { Button } from "@/components/ui/Button";
import { EmptyState, GroupCardSkeleton } from "@/components/ui/EmptyState";
import { SearchInput } from "@/components/ui/Field";
import { Pagination } from "@/components/ui/Pagination";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { StatCard } from "@/components/ui/StatCard";
import {
  paginate,
  searchEmployees,
  searchGroups,
  sortByLatestPerson,
  sortByUpdatedDesc,
} from "@/lib/filters";
import { useConsole } from "@/store/console-store";
import type { Employee, GroupLine, PeopleSearchMode } from "@/types";

const MODE_OPTIONS: { value: PeopleSearchMode; label: string }[] = [
  { value: "person", label: "ค้นหาชื่อบุคคล" },
  { value: "group", label: "ค้นหากลุ่มไลน์ / บริษัท" },
];

const PLACEHOLDERS: Record<PeopleSearchMode, string> = {
  person: "ค้นหาด้วยชื่อไทย ชื่ออังกฤษ หรือชื่อเล่น...",
  group: "ค้นหาด้วยชื่อกลุ่มไลน์ ชื่อบริษัท (TH / EN) หรือชื่อย่อบริษัท...",
};

/**
 * ผู้ติดต่อและบุคคลในบริษัท — everyone who has been through review, filed
 * under the company they belong to.
 *
 * The mirror image of สรุปข้อมูลจากไลน์อัตโนมัติ: same per-company cards, same
 * employee cards inside them, but the other side of `employees.status`. That
 * page is the queue (`pending`); this one is the record (`active`, `resigned`,
 * `transferred`, `inactive`) — which is why a person moves from there to here
 * the moment they are approved, and why nothing here has a confirm button.
 *
 * The order is the page's own: the company whose staff list changed most
 * recently, first. `line_groups.updated_at` is not that — it moves when a
 * group is renamed or rebound — so a card is ranked by its newest employee,
 * and only a company with nobody in it falls back to the group's own
 * timestamp. See `sortByLatestPerson`.
 */
export function PeoplePanel() {
  const { groupLines, employeesOf, staffCount, syncing } = useConsole();

  const [mode, setMode] = useState<PeopleSearchMode>("person");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(1);

  const searching = term.trim() !== "";

  /**
   * One row per company, staff newest-first inside it, cards ordered by their
   * newest person. Built before the search narrows it, so switching modes or
   * clearing the box costs nothing.
   *
   * A group with no company row is left out entirely rather than shown empty:
   * every write on this page is keyed by company id, so a card without one
   * could not add, edit or delete anybody — it would be a row of dead
   * buttons.
   */
  const rows = useMemo(() => {
    const withStaff = groupLines
      .filter(
        (group): group is GroupLine & { companyId: number } =>
          group.companyId !== null && group.companyId !== undefined,
      )
      .map((group) => ({
        group,
        people: sortByUpdatedDesc(
          employeesOf(group.companyId).filter((p) => p.status !== "pending"),
        ),
      }));

    return sortByLatestPerson(withStaff) as {
      group: GroupLine & { companyId: number };
      people: Employee[];
    }[];
  }, [groupLines, employeesOf]);

  /** In group mode the search narrows the directory; in person mode it does not. */
  const visible = useMemo(() => {
    if (mode !== "group" || !searching) return rows;
    const matched = new Set(
      searchGroups(
        rows.map((row) => row.group),
        term,
      ).map((group) => group.groupId),
    );
    return rows.filter((row) => matched.has(row.group.groupId));
  }, [rows, mode, term, searching]);

  /** In person mode the search answers with people, from every company at once. */
  const matchedPeople = useMemo(() => {
    if (mode !== "person" || !searching) return [];
    return searchEmployees(
      rows.flatMap((row) => row.people),
      term,
    );
  }, [rows, mode, term, searching]);

  // Five companies to a page, like every other list in the console. Changing
  // mode or term starts over, so nobody lands on a page that no longer exists.
  const view = paginate(visible, page);

  function changeMode(next: PeopleSearchMode) {
    setMode(next);
    setPage(1);
  }

  function changeTerm(next: string) {
    setTerm(next);
    setPage(1);
  }

  const companyCount = rows.length;

  return (
    <div>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-text">
            ผู้ติดต่อและบุคคลในบริษัท
          </h1>
          <p className="mt-1 text-sm text-text-2">
            รายชื่อบุคคลที่ตรวจและบันทึกเข้าฐานข้อมูลแล้ว แยกตามบริษัทของแต่ละกลุ่มไลน์
          </p>
        </div>
      </header>

      <div className="mt-6 rounded-2xl border border-line-soft bg-surface p-4 sm:p-5">
        <SegmentedControl
          value={mode}
          onChange={changeMode}
          options={MODE_OPTIONS}
          className="mb-3.5"
        />

        <SearchInput
          value={term}
          onValueChange={changeTerm}
          onClear={() => changeTerm("")}
          placeholder={PLACEHOLDERS[mode]}
        />

        {searching && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <p className="text-[12.5px] text-text-2">
              พบ{" "}
              <span className="font-mono font-medium tabular-nums text-accent">
                {mode === "person" ? matchedPeople.length : visible.length}
              </span>{" "}
              {mode === "person" ? "คน" : "บริษัท"}จากคำค้น{" "}
              <span className="text-text">“{term.trim()}”</span>
            </p>
            
          </div>
        )}

        {/* Person mode answers with its own list: a name is what was asked
            for, so a name is what comes back, with the company it belongs to
            beside it and the way into editing it on the right. */}
        {mode === "person" && searching && (
          <div className="mt-3.5">
            <PersonSearchResults
              rows={rows}
              people={matchedPeople}
              highlight={term}
            />
          </div>
        )}
      </div>

      {syncing === "initial" ? (
        <div className="mt-8 space-y-3.5">
          <GroupCardSkeleton />
          <GroupCardSkeleton />
          <GroupCardSkeleton />
        </div>
      ) : companyCount === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon="building"
            title="ยังไม่มีบริษัทในรายการ"
            detail="ผูกบริษัทให้กลุ่มไลน์ในหน้า กลุ่มไลน์และบริษัท ก่อน แล้วบุคคลของบริษัทนั้นจะมาแสดงที่นี่"
          />
        </div>
      ) : visible.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon="search"
            title="ไม่พบบริษัทที่ค้นหา"
            detail="ลองใช้คำสั้นลง หรือค้นด้วยชื่อบริษัทภาษาอังกฤษ / ชื่อย่อบริษัทแทน"
            action={<Button onClick={() => changeTerm("")}>ล้างคำค้น</Button>}
          />
        </div>
      ) : (
        <div className="mt-8 space-y-3.5">
          {view.items.map(({ group, people }) => (
            <PeopleGroupCard
              key={group.groupId}
              group={group}
              companyId={group.companyId}
              employees={people}
              highlight={mode === "group" ? term : undefined}
            />
          ))}
          <Pagination
            page={view.page}
            totalPages={view.totalPages}
            onChange={setPage}
          />
        </div>
      )}

    </div>
  );
}
