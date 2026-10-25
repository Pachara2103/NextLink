"use client";

import { useSearchParams } from "next/navigation";
import { useState, type KeyboardEvent } from "react";
import { AcademicPeriodEmptyState, AcademicPeriodSelector } from "@/features/dashboard/components/academic-period-selector";
import { DashboardModuleNav } from "@/features/dashboard/components/app-nav";
import { InternshipDirectory } from "@/features/dashboard/components/internship-directory";
import { InternshipEvaluationBoard } from "@/features/dashboard/components/internship-evaluation-board";
import { InternshipOverview } from "@/features/dashboard/components/internship-overview";
import { LocalDataStatus, StorageWarning } from "@/features/dashboard/components/local-data-status";
import { StatusToast, useStatusToast } from "@/features/dashboard/components/status-toast";
import { StorageRecoveryPanel } from "@/features/dashboard/components/storage-recovery";
import { isInternshipCompany } from "@/features/dashboard/lib/dataset-validation";
import { optionalValue } from "@/features/dashboard/lib/format";
import type { CompanyEditDraft, Props } from "@/features/dashboard/lib/internship-presentation";
import { toCount } from "@/features/dashboard/lib/internship-stats";
import { INTERNSHIP_TRACKS } from "@/features/dashboard/lib/internship-tracks";
import type { InternshipMouStatus } from "@/features/dashboard/lib/types";
import { useAcademicPeriod } from "@/features/dashboard/lib/use-academic-period";
import { useLocalDataset } from "@/features/dashboard/lib/use-local-dataset";

const VIEWS = [
  { id: "overview", label: "ภาพรวม" },
  { id: "evaluation", label: "ผลการประเมิน" },
  { id: "table", label: "ตารางข้อมูล" },
] as const;
type View = typeof VIEWS[number]["id"];
const isView = (value: string | null): value is View => VIEWS.some(v => v.id === value);

/**
 * The ฝึกงาน module, split into three sub-tabs. Every panel stays mounted so
 * filters and scroll survive switching tabs; only the active one is shown.
 */
export function InternshipWorkspace({ payload }: Props) {
  const track = payload.track;
  const period = useAcademicPeriod();
  const params = useSearchParams();
  const [view, setView] = useState<View>(() => { const v = params.get("view"); return isView(v) ? v : "overview"; });
  const { items: allCompanies, update: updateCompanies, reset: resetCompanies, editedAt, ready, warning, hasOverrides, undo, recovery, recover } = useLocalDataset(INTERNSHIP_TRACKS[track].storageKey, payload.companies, isInternshipCompany);
  const { toast, show: showToast, dismiss: dismissToast, holdTimer, resumeTimer } = useStatusToast();

  const updateMouStatus = async (id: string, nextStatus: InternshipMouStatus) => {
    const company = allCompanies.find((item) => item.id === id);
    if (!company || company.mouStatus === nextStatus) return;
    if (!await updateCompanies((current) => current.map((item) => (item.id === id ? { ...item, mouStatus: nextStatus } : item)))) { showToast("บันทึกสถานะไม่ได้ กรุณาตรวจข้อมูลล่าสุด"); return; }
    showToast(`${company.shortName} · สถานะ MOU เป็น "${nextStatus}"`, undo);
  };

  const saveCompany = (id: string, draft: CompanyEditDraft) => updateCompanies((current) => current.map((item) => (item.id === id ? {
    ...item,
    name: draft.name.trim() || item.name,
    shortName: draft.shortName.trim() || item.shortName,
    industry: draft.industry.trim() || item.industry,
    coordinator: optionalValue(draft.coordinator),
    note: optionalValue(draft.note),
    positions: draft.positions.map((position, index) => ({
      ...item.positions[index],
      name: position.name.trim() || item.positions[index]?.name || `ตำแหน่งที่ ${index + 1}`,
      declaredIntake: toCount(position.declaredIntake),
      accepted: toCount(position.accepted),
    })),
  } : item)));

  const resetDemoData = async () => {
    if (!window.confirm(`คืนค่าข้อมูล${track}ตั้งต้นและลบการแก้ไขของหน้านี้ในเบราว์เซอร์หรือไม่?`)) return;
    const persisted = await resetCompanies();
    showToast(persisted ? "คืนค่าข้อมูลตั้งต้นแล้ว" : "คืนค่าไม่ได้ ข้อมูลเดิมยังอยู่");
  };

  // Arrow keys move between tabs, per the WAI-ARIA tabs pattern.
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = VIEWS.findIndex(v => v.id === view);
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = VIEWS[(index + step + VIEWS.length) % VIEWS.length].id;
    setView(next);
    document.getElementById(`internship-tab-${next}`)?.focus();
  };

  return (
    <div className="app-shell internship-shell internship-workspace" data-track={track} data-ready={ready}>
      <header className="topbar">
        <DashboardModuleNav />
        <div className="header-tools">
          <div className="header-meta">
            <LocalDataStatus editedAt={editedAt} warning={warning} hasOverrides={hasOverrides} timezone={payload.timezone} onReset={resetDemoData} />
          </div>
          <AcademicPeriodSelector />
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="page-content">
        <StorageWarning message={warning} /><StorageRecoveryPanel key={recovery?.raw} recovery={recovery} onRecover={recover} />
        <div className="io-subtabs" role="tablist" aria-label={`มุมมองหน้า${track}`}>
          {VIEWS.map(v => <button key={v.id} id={`internship-tab-${v.id}`} type="button" role="tab" aria-selected={view === v.id} aria-controls={`internship-panel-${v.id}`} tabIndex={view === v.id ? 0 : -1} onKeyDown={onTabKey} onClick={() => setView(v.id)}>{v.label}</button>)}
        </div>

        <section id="internship-panel-overview" role="tabpanel" aria-labelledby="internship-tab-overview" hidden={view !== "overview"}>
          <InternshipOverview academicYear={period.year} />
        </section>

        <section id="internship-panel-evaluation" role="tabpanel" aria-labelledby="internship-tab-evaluation" hidden={view !== "evaluation"}>
          <InternshipEvaluationBoard academicYear={period.year} />
        </section>

        <section id="internship-panel-table" role="tabpanel" aria-labelledby="internship-tab-table" hidden={view !== "table"}>
          <AcademicPeriodEmptyState hasData={payload.companies.length > 0} />
          <InternshipDirectory track={track} view={view} allCompanies={allCompanies} applications={payload.applications} onMouStatus={updateMouStatus} onSave={saveCompany} />
        </section>
      </main>
      <StatusToast toast={toast} onDismiss={dismissToast} onHold={holdTimer} onResume={resumeTimer} />
    </div>
  );
}
