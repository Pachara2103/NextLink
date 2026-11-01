import type { ReactNode } from "react";

/** Same card anatomy/tokens as internship, independent of its fixture data. */
export function FridayReportCard({ id, title, children, className = "", tools }: { id: string; title: string; children: ReactNode; className?: string; tools?: ReactNode }) {
  return <article id={id} tabIndex={-1} className={`io-card ${className}`} aria-labelledby={`${id}-title`}>
    <header className="io-card-head"><div className="io-card-title"><h3 id={`${id}-title`}>{title}</h3></div>{tools && <div className="io-card-tools">{tools}</div>}</header>
    {children}
  </article>;
}

export function FridayTableView({ caption, children }: { caption: string; children: ReactNode }) {
  return <details className="io-table-view"><summary>ดูเป็นตาราง</summary><div className="io-table-scroll"><table><caption className="sr-only">{caption}</caption>{children}</table></div></details>;
}

export function FridayReportState({ error, loading, onRetry }: { error: string | null; loading: boolean; onRetry: () => void }) {
  return error ? <div className="friday-live-alert" role="alert"><strong>อ่านรายงานไม่สำเร็จ</strong><p>{error}</p><button className="secondary-button" type="button" onClick={onRetry}>ลองอ่านรายงานอีกครั้ง</button></div>
    : loading ? <p className="io-empty" role="status">กำลังสรุปข้อมูลจากฐานข้อมูลกลาง…</p> : null;
}
