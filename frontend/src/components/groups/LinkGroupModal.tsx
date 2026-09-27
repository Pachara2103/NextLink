"use client";

import { useMemo, useState } from "react";

import { GroupAvatar } from "@/components/groups/GroupAvatar";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { SearchInput } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { MESSAGES } from "@/lib/constants";
import { cn, companyLabel, groupLabel } from "@/lib/utils";
import { useConsole } from "@/store/console-store";
import type { CompanyLine, GroupLine } from "@/types";

/**
 * Picks the LINE group to bind a company to.
 *
 * Only groups no company points at are offered — `companies.group_id` is
 * UNIQUE, so anything else is an insert the database would refuse — and the
 * store already keeps that list as `unlinkedGroups`, so nothing is read here.
 * Binding still races: two people with this dialog open can pick the same
 * group, and the second one gets the API's "ผูกไปแล้ว" through the store's
 * toast rather than a silent failure.
 *
 * One at a time, radio-style: picking a second group drops the first. The
 * select control is a button on the right of each row rather than an actual
 * radio input, because the row is the hit target people go for — so the row
 * itself answers to a double click, which toggles the same selection off
 * again. Confirm stays disabled until something is picked.
 */
export function LinkGroupModal({
  company,
  onClose,
}: {
  company: CompanyLine;
  onClose: () => void;
}) {
  const { unlinkedGroups, linkGroup } = useConsole();

  const [selected, setSelected] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const [working, setWorking] = useState(false);

  const { primary } = companyLabel(company);
  const companyName = primary ?? MESSAGES.noCompanyName;

  // Name only: an unbound group has no company to search by, which is the
  // whole reason it is in this list.
  const groups = useMemo(() => {
    const needle = term.trim().toLowerCase();
    const list = [...unlinkedGroups].sort((a, b) =>
      groupLabel(a).localeCompare(groupLabel(b), "th"),
    );
    if (!needle) return list;
    return list.filter((group) =>
      groupLabel(group).toLowerCase().includes(needle),
    );
  }, [unlinkedGroups, term]);

  /** Radio with an off position: the same group again clears the choice. */
  function toggle(groupId: string) {
    setSelected((current) => (current === groupId ? null : groupId));
  }

  async function handleConfirm() {
    if (!selected || working) return;
    setWorking(true);
    try {
      // linkGroup raises its own toast either way; only a success should
      // close the dialog, so a lost race leaves the list open to pick again.
      const done = await linkGroup(company.companyId, selected);
      if (done) onClose();
    } finally {
      setWorking(false);
    }
  }

  return (
    <Modal
      open
      icon="link"
      maxWidth="640px"
      title={`ผูกกลุ่มไลน์กับ: ${companyName}`}
      subtitle="เลือกกลุ่มไลน์ที่ยังไม่ถูกผูกกับบริษัทใด — เลือกได้ครั้งละหนึ่งกลุ่ม"
      onClose={onClose}
      closeDisabled={working}
      footer={
        <>
          <Button disabled={working} onClick={onClose}>
            ยกเลิก
          </Button>
          <Button
            variant="primary"
            icon="link"
            loading={working}
            className="ml-auto"
            // Nothing picked means nothing to send — the button says so rather
            // than firing a request the API would reject.
            disabled={selected === null}
            onClick={handleConfirm}
          >
            {working ? "กำลังผูกกลุ่มไลน์..." : "ยืนยัน"}
          </Button>
        </>
      }
    >
      {unlinkedGroups.length === 0 ? (
        <div className="rounded-xl border border-line bg-sunken p-6 text-center">
          <Icon name="check-circle" className="mx-auto size-6 text-ok" />
          <p className="mt-2 text-[13px] text-text-2">
            {MESSAGES.noFreeGroupsToLink}
          </p>
        </div>
      ) : (
        <>
          <SearchInput
            value={term}
            onValueChange={setTerm}
            onClear={() => setTerm("")}
            placeholder="ค้นหาด้วยชื่อกลุ่มไลน์..."
          />

          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-[10px] tracking-[0.14em] text-text-4 uppercase">
              กลุ่มไลน์ที่ยังว่าง
            </p>
            <p className="font-mono text-[11px] tabular-nums text-text-3">
              {groups.length}/{unlinkedGroups.length}
            </p>
          </div>

          {groups.length === 0 ? (
            <p className="rounded-xl border border-line bg-sunken p-5 text-center text-[13px] text-text-3">
              ไม่พบกลุ่มไลน์ที่ตรงกับคำค้น “{term.trim()}”
            </p>
          ) : (
            // Capped and scrollable: the dialog must not grow past the screen
            // on a workspace with dozens of unbound groups.
            <ul className="max-h-[19rem] space-y-2 overflow-y-auto pr-0.5">
              {groups.map((group) => (
                <GroupOption
                  key={group.groupId}
                  group={group}
                  picked={selected === group.groupId}
                  disabled={working}
                  onToggle={() => toggle(group.groupId)}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </Modal>
  );
}

/** One row of the list: the group's avatar and name, and its select button. */
function GroupOption({
  group,
  picked,
  disabled,
  onToggle,
}: {
  group: GroupLine;
  picked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const name = groupLabel(group);

  return (
    <li
      // The row is the obvious thing to double click, and that is the gesture
      // the brief asks to toggle on. A single click on the row does nothing on
      // purpose: it would fire twice inside every double click.
      onDoubleClick={() => {
        if (!disabled) onToggle();
      }}
      // Selected state is announced by the button's aria-pressed below;
      // aria-selected is not a property a plain listitem carries.
      className={cn(
        "flex select-none items-center gap-3 rounded-xl border p-3 transition",
        picked
          ? "border-accent bg-accent-soft"
          : "border-line bg-surface hover:border-text-4 hover:bg-surface-2",
      )}
    >
      <div
        className={cn(
          "grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg border",
          picked ? "border-accent-line bg-accent-soft" : "border-line bg-sunken",
        )}
      >
        <GroupAvatar
          src={group.pictureUrl}
          alt={name}
          className="size-full object-cover"
          fallback={
            <Icon
              name="message"
              className={cn("size-4", picked ? "text-accent" : "text-text-3")}
            />
          }
        />
      </div>

      <p className="min-w-0 flex-1 truncate text-[13.5px] text-text">{name}</p>

      <button
        type="button"
        disabled={disabled}
        aria-pressed={picked}
        // Stops the row's double-click handler from also firing on a double
        // click of the button itself, which would toggle twice and settle back.
        onDoubleClick={(event) => event.stopPropagation()}
        onClick={onToggle}
        className={cn(
          "inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition disabled:cursor-not-allowed disabled:opacity-60",
          picked
            ? "border-accent bg-accent text-accent-ink"
            : "border-line bg-surface text-text-2 hover:border-text-4 hover:text-text",
        )}
      >
        <Icon name={picked ? "check" : "plus"} className="size-3.5" />
        {picked ? "เลือกแล้ว" : "เลือก"}
      </button>
    </li>
  );
}
