import { AppNav, DashboardModuleNav } from "@/features/dashboard/components/app-nav";

/**
 * Shared by all dashboard modules — each route segment inherits the nearest
 * parent loading UI, and every page has the same KPI-then-table shape.
 *
 * The header here mirrors the real one exactly, nav included. An earlier
 * version left the nav out, so moving between sections made the control the
 * reader had just clicked disappear and come back.
 */
export default function Loading() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <AppNav title="กำลังโหลด…" />
        <div className="header-tools" aria-hidden="true">
          <div className="header-meta"><span className="skeleton skeleton-line" style={{ width: 280, height: 28 }} /></div>
          <div className="academic-period-panel"><div className="academic-period-fields">
            {[0, 1].map(index => <div className="skeleton-period-field" key={index}>
              <span className="skeleton skeleton-line" style={{ width: 80, height: 18 }} />
              <span className="skeleton skeleton-row" />
            </div>)}
          </div></div>
        </div>
      </header>
      <DashboardModuleNav />
      <main id="main-content" tabIndex={-1} className="page-content">
        <p className="sr-only" role="status">กำลังโหลดข้อมูลแดชบอร์ด</p>
        <section className="kpi-grid" aria-hidden="true">
          {Array.from({ length: 5 }, (_, index) => (
            <div className="kpi-card skeleton-card" key={index}>
              <span className="skeleton skeleton-line skeleton-sm" />
              <span className="skeleton skeleton-line skeleton-lg" />
              <span className="skeleton skeleton-line" />
            </div>
          ))}
        </section>
        <section className="panel" aria-hidden="true">
          <span className="skeleton skeleton-line skeleton-md" />
          <div className="skeleton-rows">
            {Array.from({ length: 6 }, (_, index) => (
              <span className="skeleton skeleton-row" key={index} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
