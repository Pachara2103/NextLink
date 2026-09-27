"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/Modal";
import { MESSAGES } from "@/lib/constants";
import { companyLabel, lineGroupLabel } from "@/lib/utils";
import { useConsole } from "@/store/console-store";

/**
 * What the button needs to name what it is about to unbind.
 *
 * A shape rather than `CompanyLine`, because both joins reach it: the company
 * cards on กลุ่มไลน์และบริษัท pass a `CompanyLine`, and the review cards on
 * สรุปข้อมูลจากไลน์ pass a `GroupLine` — same pair of rows, read from
 * opposite ends, and the unlink is the same write either way.
 */
export interface UnlinkGroupTarget {
  /** `companies.id` — null means there is nothing bound to let go of. */
  companyId?: number | null;
  /** `companies.group_id` / the LINE group's own id. */
  groupId?: string | null;
  companyTh?: string | null;
  companyEn?: string | null;
  /** The LINE group's name, for the dialog. */
  displayName?: string | null;
}

/**
 * Sits next to the edit button on a company that has a LINE group, and undoes
 * that binding.
 *
 * It was UnlinkCompanyButton, and both the name and what it does have changed.
 * Behind the confirm it calls `POST /companies/{id}/unlink`, which sets
 * `companies.group_id` to null — the company row itself stays, with its
 * people, its notes and its graph node. So this is not "remove the company",
 * it is "let go of the LINE group": the company moves to
 * "บริษัทที่ยังไม่ผูกกลุ่มไลน์" and can be bound to another group, and the
 * group it let go of turns up under "กลุ่มไลน์ที่ยังไม่ได้ผูกบริษัท".
 *
 * The dialog says which group is being let go of and which company keeps its
 * data, because the old wording ("ยกเลิกการผูกบริษัท") read as a delete.
 */
export function UnlinkGroupButton({
  company,
  size = "sm",
  className,
}: {
  company: UnlinkGroupTarget;
  size?: "sm" | "md";
  /** Lets a card footer stretch it to its share of the row. */
  className?: string;
}) {
  const { unlinkGroup } = useConsole();
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);

  const { primary } = companyLabel(company);
  const companyName = primary ?? MESSAGES.noCompanyName;
  const { label: groupName } = lineGroupLabel(company);

  async function onConfirm() {
    setWorking(true);
    try {
      // unlinkGroup raises its own toast on failure, so there is nothing to
      // report here — the dialog closes either way.
      await unlinkGroup(company);
    } finally {
      setWorking(false);
      setConfirming(false);
    }
  }

  return (
    <>
      <Button
        variant="danger"
        icon="unlink"
        size={size}
        className={className}
        onClick={() => setConfirming(true)}
      >
        ยกเลิกผูกกลุ่มไลน์
      </Button>

      <ConfirmModal
        open={confirming}
        icon="unlink"
        tone="danger"
        title="ยกเลิกการผูกกลุ่มไลน์"
        confirmLabel="ยกเลิกการผูก"
        loading={working}
        onConfirm={onConfirm}
        onCancel={() => setConfirming(false)}
      >
        ต้องการยกเลิกการผูกกลุ่มไลน์{" "}
        <strong className="font-semibold text-text">{groupName}</strong> ออกจาก{" "}
        <strong className="font-semibold text-text">{companyName}</strong>{" "}
        ใช่หรือไม่? ข้อมูลบริษัท บุคคล และโน้ตทั้งหมดยังอยู่ครบ
        เพียงแต่บริษัทนี้จะย้ายไปอยู่ในหัวข้อ “บริษัทที่ยังไม่ผูกกลุ่มไลน์”
        และกลุ่มไลน์นี้จะกลับมาว่างให้ผูกกับบริษัทอื่นได้
      </ConfirmModal>
    </>
  );
}
