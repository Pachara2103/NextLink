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
   * Which course is open for editing, and the answer being built for it.
   *
   * One card at a time, and the grid is read-only until แก้ไข is pressed.
   * Every tick used to be a save of its own, which is right for a tick that
   * means something on its own — and a company's answer is not that. "จันทร์
   * เช้าได้ พุธบ่ายก็ได้ อ้อ เสาร์ไม่ได้แล้ว" is one answer given in one phone
   * call, and saving the halfway versions of it puts times on the shared plan
   * that nobody ever offered.
   */
  const [editing, setEditing] = useState<{ courseId: string; slots: SlotId[] } | null>(null);
  const [saving, setSaving] = useState(false);

  const startEdit = (course: { id: string; availability: SlotId[] }) =>
    setEditing({ courseId: course.id, slots: [...course.availability] });

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

  const saveEdit = async (title: string) => {
    if (!editing) return;
    setSaving(true);
    const saved = await plan.setAvailability(editing.courseId, editing.slots);
    setSaving(false);
    if (!saved) return;
    setEditing(null);
    show(`บันทึกช่วงที่สะดวกของ ${title} แล้ว`);
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
            const isEditing = editing?.courseId === course.id;
            /** What the grid draws: the draft while editing, the saved answer otherwise. */
            const shown = isEditing ? editing.slots : course.availability;
            const tooFew = shown.length < course.sessionsPerWeek;
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
                    {placed.length === 0 ? (
                      <span className="status-pill tone-orange">ยังไม่ได้จัด</span>
                    ) : (
                      <span className="selection-chip-list">
                        {placed.map((item) => (
                          <span className="selection-chip" key={item.id}>{slotLabel(item.slotId)}</span>
                        ))}
                      </span>
                    )}
                    {/* One card open at a time: two half-finished answers on
                        screen is two chances to press บันทึก on the wrong one. */}
                    {isEditing ? null : (
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={editing !== null}
                        onClick={() => startEdit(course)}
                      >
                        แก้ไข
                      </button>
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
                        const on = shown.includes(slotId);
                        const used = placed.some((item) => item.slotId === slotId);
                        const label = `${slotLabel(slotId)}${used ? " — จัดวิชานี้ไว้แล้ว" : on ? " — สะดวก" : " — ไม่สะดวก"}`;
                        const mark = <span aria-hidden="true">{used ? "●" : on ? "✓" : ""}</span>;
                        // A card nobody is editing renders spans, not disabled
                        // buttons: eighteen dead tab stops per card, on a page
                        // that is mostly cards nobody is editing.
                        return isEditing ? (
                          <button
                            className={`availability-slot${on ? " is-on" : ""}${used ? " is-used" : ""}`}
                            key={slotId}
                            type="button"
                            aria-pressed={on}
                            onClick={() => toggleDraft(slotId)}
                          >
                            {mark}
                            <span className="sr-only">{label}</span>
                          </button>
                        ) : (
                          <span
                            className={`availability-slot is-static${on ? " is-on" : ""}${used ? " is-used" : ""}`}
                            key={slotId}
                          >
                            {mark}
                            <span className="sr-only">{label}</span>
                          </span>
                        );
                      })}
                    </div>
                  ))}
                </div>

                {tooFew ? (
                  <p className="edit-mode-note">
                    วิชานี้ต้องได้ {formatNumber(course.sessionsPerWeek)} คาบต่อสัปดาห์ แต่บริษัทแจ้งไว้เพียง{" "}
                    {formatNumber(shown.length)} คาบ — ต้องขอเพิ่มก่อนจึงจะจัดครบได้
                  </p>
                ) : null}

                {isEditing ? (
                  <div className="availability-actions">
                    {/* The count sits here rather than in the button: it is the
                        one number that moves as the grid is ticked, and it is
                        what the reader checks against "ต้องได้ N คาบ". */}
                    <span className="availability-count">เลือกไว้ {formatNumber(shown.length)} คาบ</span>
                    <button className="secondary-button" type="button" disabled={saving} onClick={() => setEditing(null)}>
                      ยกเลิก
                    </button>
                    <button className="primary-button" type="button" disabled={saving} onClick={() => void saveEdit(course.title)}>
                      {saving ? "กำลังบันทึก…" : "บันทึก"}
                    </button>
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}

      <StatusToast toast={toast} onDismiss={dismiss} onHold={holdTimer} onResume={resumeTimer} />
    </PlanShell>
  );
}
