"use client";

import { Component, Suspense, type ReactNode, type Ref } from "react";

type Props = { dialogRef: Ref<HTMLDialogElement>; onClose: () => void; children: ReactNode };

function DialogStatus({ dialogRef, onClose, failed = false }: Omit<Props, "children"> & { failed?: boolean }) {
  return <dialog ref={dialogRef} className="course-dialog" data-dialog-status tabIndex={-1} aria-labelledby="dialog-status-title" onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div>
      <div className="dialog-header">
        <h2 id="dialog-status-title">{failed ? "โหลดรายละเอียดไม่สำเร็จ" : "กำลังโหลดรายละเอียด"}</h2>
        <button className="icon-button" type="button" onClick={onClose} aria-label="ปิดรายละเอียด">×</button>
      </div>
      <div className="dialog-content">
        <p role={failed ? "alert" : "status"}>{failed ? "ตรวจสอบการเชื่อมต่อ แล้วโหลดหน้าใหม่เพื่อลองอีกครั้ง" : "รอสักครู่…"}</p>
        {failed && <button className="secondary-button" type="button" onClick={() => window.location.reload()}>โหลดหน้าใหม่</button>}
      </div>
    </div>
  </dialog>;
}

/** Keep the dashboard usable if an on-demand chunk fails to download. */
class DialogBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <DialogStatus dialogRef={this.props.dialogRef} onClose={this.props.onClose} failed /> : this.props.children;
  }
}

export function DeferredRecordDialog({ children, ...props }: Props) {
  return <DialogBoundary {...props}><Suspense fallback={<DialogStatus {...props} />}>{children}</Suspense></DialogBoundary>;
}
