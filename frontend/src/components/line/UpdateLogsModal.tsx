"use client";

import { useCallback, useState } from "react";

import { Icon } from "@/components/icons";
import { Alert } from "@/components/ui/Alert";
import { Badge, CountChip } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { MESSAGES } from "@/lib/constants";
import { describeError } from "@/lib/services/errors";
import { refreshUpdateLogs, useUpdateLogs } from "@/lib/update-logs";
import { formatThaiDate } from "@/lib/utils";
import type { UpdateLog } from "@/types";

/**
 * The history behind "อัปเดตข้อมูล": who ran it, when, and which groups the
 * extraction pass could not finish that time.
 *
 * The log itself lives in lib/update-logs, shared with the panel behind this
 * dialog: by the time anyone opens this, the list is usually already read, so
 * a second open costs no request. รีเฟรชประวัติ is how you ask again.
 */
export function UpdateLogsModal({ onClose }: { onClose: () => void }) {
  const { status, logs, cause } = useUpdateLogs();
  /** The รีเฟรชประวัติ button's own state: the list below stays put. */
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshUpdateLogs();
    } finally {
      setRefreshing(false);
    }
  }, []);

  // A re-read that fails keeps the list it had, so the message sits above what
  // is still on screen rather than replacing it with nothing.
  const failure =
    status === "error"
      ? describeError(cause, MESSAGES.updateLogsPrefix, {
          network: `${MESSAGES.updateLogsPrefix}: เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบการเชื่อมต่อ`,
          unknown: `${MESSAGES.updateLogsPrefix} กรุณาลองใหม่อีกครั้ง`,
        })
      : null;
  const loading = status === "idle" || (status === "loading" && logs.length === 0);

  return (
    <Modal
      open
      icon="clock"
      maxWidth="680px"
      title="ประวัติการอัปเดตข้อมูล"
      subtitle="เรียงจากครั้งล่าสุดขึ้นก่อน"
      onClose={onClose}
      footer={
        <>
        
          <div className="flex w-full items-center justify-end gap-2">
           <Button
            icon="refresh"
            loading={refreshing}
            disabled={refreshing || loading}
            onClick={() => void refresh()}
          >
          รีเฟรชประวัติ
         </Button>
         <Button onClick={onClose}>ปิด</Button>
         </div>
         
        </>
      }
    >
      {loading && <Alert tone="loading" title="กำลังโหลดประวัติ..." />}

      {failure && <Alert tone="error" title={failure} />}

      {!loading && !failure && logs.length === 0 && (
        <div className="rounded-xl border border-dashed border-line bg-sunken px-4 py-8 text-center">
          <Icon name="clock" className="mx-auto size-6 text-text-4" />
          <p className="mt-2.5 text-[13px] text-text-2">
            {MESSAGES.updateLogsEmpty}
          </p>
        </div>
      )}

      {logs.length > 0 && (
        <ol className="space-y-2.5">
          {logs.map((log) => (
            <LogRow key={log.id} log={log} />
          ))}
        </ol>
      )}
    </Modal>
  );
}

function LogRow({ log }: { log: UpdateLog }) {
  const failed = log.errorGroups ?? [];
  const clean = failed.length === 0;

  return (
    <li className="rounded-xl border border-line bg-surface p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <Icon name="user" className="size-3.5 shrink-0 text-text-3" />
        <span
          className={
            log.displayName
              ? "text-[13.5px] font-medium text-text"
              : "text-[13.5px] text-text-3 italic"
          }
        >
          {log.displayName ?? MESSAGES.noDisplayName}
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[11.5px] tabular-nums text-text-3">
          <Icon name="clock" className="size-3.5" />
          {formatThaiDate(log.createdAt, true)}
        </span>
        <span className="ml-auto flex items-center gap-2">
          {clean ? (
            <Badge tone="matched">
              <Icon name="check" className="size-3" />
              สำเร็จทุกกลุ่ม
            </Badge>
          ) : (
            <>
              <span className="text-[11.5px] text-warn">
                กลุ่มที่ไม่สำเร็จ
              </span>
              <CountChip tone="unmatched">{failed.length}</CountChip>
            </>
          )}
        </span>
      </div>

      {!clean && (
        <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-line pt-2.5">
          {failed.map((name, index) => (
            <Badge key={`${name}-${index}`} tone="unmatched">
              <Icon name="alert" className="size-3" />
              {name}
            </Badge>
          ))}
        </div>
      )}
    </li>
  );
}
