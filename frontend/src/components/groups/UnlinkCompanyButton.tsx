"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/Modal";
import { companyLabel, groupLabel } from "@/lib/utils";
import { useConsole } from "@/store/console-store";
import type { GroupLine } from "@/types";

/**
 * Sits next to the edit button on a linked group and undoes the binding.
 *
 * Behind the confirm it calls DELETE /companies/{id}, which drops the company
 * row — so the group's LEFT JOIN gives it companyId = null again and it moves
 * back to "ยังไม่ได้ผูกบริษัท". The dialog spells out both halves of that,
 * because the graph node goes with it and coordinators approved under this
 * company have to be approved again once the right one is bound.
 */
export function UnlinkCompanyButton({
  group,
  size = "sm",
}: {
  group: GroupLine;
  size?: "sm" | "md";
}) {
  const { unlinkCompany } = useConsole();
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);

  const { primary } = companyLabel(group);
  const name = primary ?? "บริษัทนี้";

  async function onConfirm() {
    setWorking(true);
    try {
      // unlinkCompany raises its own toast on failure, so there is nothing to
      // report here — the dialog closes either way.
      await unlinkCompany(group);
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
        onClick={() => setConfirming(true)}
      >
        
      </Button>

      <ConfirmModal
        open={confirming}
        icon="unlink"
        tone="danger"
        title="ยกเลิกการผูกบริษัท"
        confirmLabel="ยกเลิกการผูก"
        loading={working}
        onConfirm={onConfirm}
        onCancel={() => setConfirming(false)}
      >
        ต้องการยกเลิกการผูกบริษัทกับ{" "}
        <strong className="font-semibold text-text">
          {groupLabel(group)}
        </strong>{" "}
        ใช่หรือไม่?
      
      </ConfirmModal>
    </>
  );
}
