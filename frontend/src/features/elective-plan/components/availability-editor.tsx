"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { EmptyResult } from "@/features/elective-plan/components/empty-result";
import { PlanShell } from "@/features/elective-plan/components/plan-shell";
import { ResultAnnouncer } from "@/features/elective-plan/components/result-announcer";
import { StatusToast, useStatusToast } from "@/features/elective-plan/components/status-toast";
import { formatNumber } from "@/features/elective-plan/lib/format";
import { SlotFilters, matchesSlotFilter } from "@/features/elective-plan/components/slot-filters";
import { DAYS, DAY_SHORT, PERIODS, PERIOD_KEYS, makeSlotId, slotLabel, type DayKey, type PeriodKey, type SlotId } from "@/features/elective-plan/lib/slots.ts";
import type { PlanPayload } from "@/features/elective-plan/lib/plan-types.ts";
import { usePlanState } from "@/features/elective-plan/lib/use-plan-state";
import { dayFilter, periodFilter } from "@/features/elective-plan/lib/filter-values.ts";
import { useUrlFilters } from "@/features/elective-plan/lib/use-url-filters";

/**
 * Where the companies' answers are kept up to date.
 *
 * This is the page that decides whether the planner survives contact with the
 * job. Availability changes every time somebody gets off the phone, and if
 * that edit has to go through a developer or back into a spreadsheet, the
 * spreadsheet becomes the real plan again within a week.
 */
export function AvailabilityEditor() {
  const plan = usePlanState();
  const payload = plan.payload;
  const { toast, show, dismiss, holdTimer, resumeTimer } = useStatusToast();
  const [search, setSearch] = useState("");
  const [provider, setProvider] = useState("");
  const [day, setDay] = useState<DayKey | "">("");
  const [period, setPeriod] = useState<PeriodKey | "">("");
  const deferredSearch = useDeferredValue(search);
  const deferredProvider = useDeferredValue(provider);

  // Arriving from a company name on the overview lands here with that company
  // already filled in, which is the only reason that link is worth clicking.
  useUrlFilters({ q: search, provider, day, period }, (found) => {
    setSearch(found.q ?? "");
    setProvider(found.provider ?? "");
    setDay(dayFilter(found.day));
    setPeriod(periodFilter(found.period));
  });

  const rows = useMemo(() => {
    const needle = deferredSearch.trim().toLowerCase();
    const providerNeedle = deferredProvider.trim().toLowerCase();
    return plan.courses.filter((course) => {
      if (providerNeedle && !course.provider.toLowerCase().includes(providerNeedle)) return false;
      if (!matchesSlotFilter(course.availability, day, period)) return false;
      if (!needle) return true;
      return [course.title, course.courseCode, course.provider, course.instructor]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [plan.courses, deferredSearch, deferredProvider, day, period]);

  /**
   * One card at a time, and only while แก้ไข is on.
   *
   * The grid used to write every tick straight through. That is the right
   * shape for a switch and the wrong one for this: eighteen targets the size
   * of a fingertip, read off a phone call, where a mis-tick is a company
   * told the wrong thing. Holding the ticks in a draft until บันทึก makes
   * the mis-tick cost nothing, and makes ยกเลิก mean what it says instead
   * of being a second round of ticking.
   *
   * Scoped to one course because that is the unit of the conversation — the
   * card being edited is the company on the phone.
   */
  const [editing, setEditing] = useState<{ courseId: string; slots: SlotId[] } | null>(null);
  const [saving, setSaving] = useState(false);

  const startEdit = (courseId: string, slots: SlotId[]) => setEditing({ courseId, slots: [...slots] });

  const toggleDraft = (slotId: SlotId) =>
    setEditing((current) =>
      current === null
        ? current
        : {
            ...current,
            slots: current.slots.includes(slotId)
              ? current.slots.filter((slot) => slot !== slotId)
              : [...current.slots, slotId],
          },
    );

  const saveEdit = async (courseTitle: string) => {
    if (!editing || saving) return;
    setSaving(true);
    try {
      if (!await plan.setAvailability(editing.courseId, editing.slots)) return;
      setEditing(null);
      show(`บันทึกช่วงที่สะดวกของ ${courseTitle} แล้ว`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <PlanShell
      title="วิชาและช่วงที่สะดวก"
      lastUpdated={payload.lastUpdated}
      timezone={payload.timezone}
      isMock={payload.isMock}
      editedAt={plan.editedAt}
      onReset={plan.resetAll}
    >
      <div className="intro-row">
        <div>
          <p className="section-kicker">ข้อมูลจากบริษัท</p>
          <h2>ช่วงที่แต่ละบริษัทสอนได้</h2>
          <p className="intro-copy">
            ติ๊กคาบที่บริษัทแจ้งว่าสะดวก ยิ่งบริษัทให้ทางเลือกน้อย ระบบจะยิ่งจัดให้ก่อน
          </p>
        </div>
        <div className="intro-badges">
          <span className="scope-chip">
            <span className="scope-chip-label">วิชาทั้งหมด</span> {formatNumber(plan.courses.length)}
          </span>
        </div>
      </div>

      <section className="control-panel">
        <div className="control-heading">
          <div>
            <p className="section-kicker">ตัวกรอง</p>
            <h3>หาวิชาที่ต้องการแก้</h3>
          </div>
        </div>
        <div className="filters">
          <label>
            ค้นหา
            <input
              type="search"
              value={search}
              placeholder="ชื่อวิชา รหัส หรือบริษัท"
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label>
            บริษัท
            {/* Typed, and only typed: a real term brings hundreds of companies,
                and neither a select nor an autocomplete list of that length is
                faster than knowing the first three letters. */}
            <input
              type="search"
              value={provider}
              placeholder="พิมพ์ชื่อบริษัท"
              onChange={(event) => setProvider(event.target.value)}
            />
          </label>
          <SlotFilters day={day} period={period} onDay={setDay} onPeriod={setPeriod} />
        </div>
      </section>

      <p className="availability-legend">
        <span className="availability-slot is-on" aria-hidden="true">✓</span>
        <span>บริษัทแจ้งว่าสอนคาบนี้ได้</span>
        <span className="availability-slot is-used" aria-hidden="true">●</span>
        <span>สะดวก และตอนนี้วิชานี้ถูกจัดลงคาบนี้แล้ว</span>
        <span className="availability-slot" aria-hidden="true" />
        <span>ไม่สะดวก</span>
        <span>· กด แก้ไข ที่การ์ดของวิชาก่อนจึงติ๊กได้ แล้วกด บันทึก</span>
      </p>

      <ResultAnnouncer message={`พบ ${rows.length} วิชา`} />

      {rows.length === 0 ? (
        <section className="panel">
          <EmptyResult message="ไม่พบวิชาที่ตรงกับตัวกรอง" hasFilters={Boolean(search || provider || day || period)} />
        </section>
      ) : (
        <div className="course-availability-list">
          {rows.map((course) => {
            const placed = plan.assignments.filter((item) => item.courseId === course.id);
            const draft = editing?.courseId === course.id ? editing : null;
            // While a card is being edited the grid shows the draft, so a tick
            // and the count under it can never disagree.
            const slots = draft ? draft.slots : course.availability;
            const tooFew = slots.length < course.sessionsPerWeek;
            const locked = editing !== null && !draft;
            return (
              <section className="panel course-availability-card" key={course.id}>
                <div className="panel-heading">
                  <div>
                    <p className="section-kicker">{course.courseCode} · {course.category}</p>
                    <h3>{course.title}</h3>
                    <p className="panel-caption">
                      {course.provider} · {course.instructor} · รับ {formatNumber(course.capacity)} คน ·
                      ต้องได้ {formatNumber(course.sessionsPerWeek)} คาบ/สัปดาห์
                    </p>
                  </div>
                  <div className="readiness-heading-meta">
                    {draft ? <span className="status-pill tone-orange">กำลังแก้ไข</span> : null}
                    {placed.length === 0 ? (
                      <span className="status-pill tone-orange">ยังไม่ได้จัด</span>
                    ) : (
                      <span className="selection-chip-list">
                        {placed.map((item) => (
                          <span className="selection-chip" key={item.id}>{slotLabel(item.slotId)}</span>
                        ))}
                      </span>
                    )}
                  </div>
                </div>

                <div className="availability-grid" role="group" aria-label={`ช่วงที่สะดวกของ ${course.title}`}>
                  <div className="availability-row">
                    <span className="availability-corner" aria-hidden="true" />
                    {DAYS.map((day) => (
                      <span className="availability-head" key={day}>{DAY_SHORT[day]}</span>
                    ))}
                  </div>
                  {PERIOD_KEYS.map((period) => (
                    <div className="availability-row" key={period}>
                      <span className="availability-period">
                        {PERIODS[period].label}
                        <small>{PERIODS[period].start}–{PERIODS[period].end}</small>
                      </span>
                      {DAYS.map((day) => {
                        const slotId = makeSlotId(day, period);
                        const on = slots.includes(slotId);
                        const used = placed.some((item) => item.slotId === slotId);
                        const className = `availability-slot${on ? " is-on" : ""}${used ? " is-used" : ""}`;
                        const reading = (
                          <>
                            <span aria-hidden="true">{used ? "●" : on ? "✓" : ""}</span>
                            <span className="sr-only">
                              {slotLabel(slotId)}
                              {used ? " — จัดวิชานี้ไว้แล้ว" : on ? " — สะดวก" : " — ไม่สะดวก"}
                            </span>
                          </>
                        );
                        // A card that is not being edited is read, not pressed:
                        // a button that does nothing still looks pressable and
                        // still takes a tab stop, which is how a reader is
                        // taught that nothing on this page works.
                        return draft ? (
                          <button
                            className={className}
                            key={slotId}
                            type="button"
                            aria-pressed={on}
                            disabled={saving}
                            onClick={() => toggleDraft(slotId)}
                          >
                            {reading}
                          </button>
                        ) : (
                          <span className={`${className} is-static`} key={slotId}>
                            {reading}
                          </span>
                        );
                      })}
                    </div>
                  ))}
                </div>

                {tooFew ? (
                  <p className="edit-mode-note">
                    วิชานี้ต้องได้ {formatNumber(course.sessionsPerWeek)} คาบต่อสัปดาห์ แต่บริษัทแจ้งไว้เพียง{" "}
                    {formatNumber(slots.length)} คาบ — ต้องขอเพิ่มก่อนจึงจะจัดครบได้
                  </p>
                ) : null}

                <div className="availability-actions">
                  {draft ? (
                    <>
                      <span className="availability-count" role="status">
                        เลือกไว้ {formatNumber(slots.length)} คาบ
                      </span>
                      <button
                        className="primary-button"
                        type="button"
                        disabled={saving}
                        onClick={() => void saveEdit(course.title)}
                      >
                        {saving ? "กำลังบันทึก…" : "บันทึก"}
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={saving}
                        onClick={() => setEditing(null)}
                      >
                        ยกเลิก
                      </button>
                    </>
                  ) : (
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={locked}
                      /* One card open at a time: two drafts side by side is two
                         บันทึก buttons and no way to tell which call they
                         belong to. */
                      title={locked ? "บันทึกหรือยกเลิกวิชาที่แก้อยู่ก่อน" : undefined}
                      onClick={() => startEdit(course.id, course.availability)}
                    >
                      แก้ไข
                    </button>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <StatusToast toast={toast} onDismiss={dismiss} onHold={holdTimer} onResume={resumeTimer} />
    </PlanShell>
  );
}
