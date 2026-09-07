"use client";

import { useState } from "react";

import { Icon } from "@/components/icons";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { MAX_ALIASES, MESSAGES } from "@/lib/constants";
import { cn, groupLabel, hasCompanyName } from "@/lib/utils";
import { useConsole } from "@/store/console-store";
import type { GroupLine } from "@/types";


export function CompanyForm({ group }: { group: GroupLine }) {
  const { saveCompany, closeCompanyForm, notify } = useConsole();

  const [companyTh, setCompanyTh] = useState(group.companyTh ?? "");
  const [companyEn, setCompanyEn] = useState(group.companyEn ?? "");
  
  const [aliases, setAliases] = useState<string[]>(() => group.aliases ?? []);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Already bound to a company, so this is a rename, not a binding. The whole
  // form says so — heading, button and hint all read off this one flag.
  const linked = group.isLinked;
  const title = groupLabel(group);

  function addAlias() {
    if (aliases.length >= MAX_ALIASES) {
      setError(MESSAGES.aliasLimitReached);
      return;
    }
    setAliases((current) => [...current, ""]);
    setError(null);
  }

  function editAlias(index: number, value: string) {
    setAliases((current) => current.map((a, i) => (i === index ? value : a)));
    setError(null);
  }

  function removeAlias(index: number) {
    setAliases((current) => current.filter((_, i) => i !== index));
    setError(null);
  }

  async function handleConfirm() {
    if (saving) return;

    if (!hasCompanyName({ companyTh, companyEn })) {
      setError(MESSAGES.requireCompanyName);
      return;
    }

    if (aliases.some((alias) => alias.trim() === "")) {
      setError(MESSAGES.requireAlias);
      return;
    }

    // Blank stays out of the body entirely rather than going as "": the UPDATE
    // coalesces on null, so an omitted name keeps the one already stored.
    const th = companyTh.trim() || null;
    const en = companyEn.trim() || null;

    // The write is async: only announce success once it resolves, otherwise
    // the failure toast lands on top of a bogus success toast.
    setSaving(true);
    try {
      const saved = await saveCompany(group, {
        companyTh: th,
        companyEn: en,
        // Always sent, never omitted: the whole list is what the user sees, so
        // it is the whole list that gets stored — including an empty one, which
        // is how every alias is removed.
        aliases: aliases.map((alias) => alias.trim()),
      });
      if (!saved) return; // the store already raised the error toast
      notify({
        kind: "success",
        message: linked
          ? `แก้ไขชื่อบริษัทกลุ่ม ${title} สำเร็จ`
          : `ผูก ${title} กับ ${th ?? en} เรียบร้อย`,
      });
    } finally {
      setSaving(false);
    }
  }

  const atLimit = aliases.length >= MAX_ALIASES;

  return (
    <Modal
      open
      icon="pencil"
      maxWidth="640px"
      title={`แก้ไขข้อมูลกลุ่ม: ${title}`}
      subtitle={
        linked
          ? "แก้ไขชื่อบริษัทที่ผูกกับกลุ่มนี้ — ช่องที่เว้นว่างจะไม่ถูกบันทึก"
          : "กรอกชื่อบริษัทเพื่อผูกกับกลุ่มไลน์นี้ — กรอกอย่างน้อยหนึ่งภาษา"
      }
      onClose={closeCompanyForm}
      closeDisabled={saving}
      footer={
        <>
          <Button disabled={saving} onClick={closeCompanyForm}>
            ยกเลิก
          </Button>
          <Button
            variant="primary"
            icon="check"
            loading={saving}
            className="ml-auto"
            onClick={handleConfirm}
          >
            {saving
              ? "กำลังบันทึก..."
              : linked
                ? "บันทึกการแก้ไข"
                : "ยืนยันและผูกบริษัท"}
          </Button>
        </>
      }
    >
      <section className="rounded-xl border border-line bg-sunken p-3.5 sm:p-4">
        <h4 className="flex items-center gap-2 font-mono text-[10px] tracking-[0.14em] text-text-3 uppercase">
          <Icon name="building" className="size-3.5" />
          {/* "เพิ่ม" only makes sense before the group is bound; after that this
              same form is editing a company that already exists. */}
          {linked ? "แก้ไขชื่อบริษัท" : "เพิ่มชื่อบริษัท"}
        </h4>

        <div className="mt-3 grid gap-3.5 sm:grid-cols-2">
          <TextField
            label="ชื่อบริษัท (TH)"
            value={companyTh}
            placeholder="เช่น เอ็มเทค อินโนเวชัน จำกัด"
            invalid={Boolean(error) && !hasCompanyName({ companyTh, companyEn })}
            onChange={(event) => {
              setCompanyTh(event.target.value);
              setError(null);
            }}
          />
          <TextField
            label="ชื่อบริษัท (EN)"
            value={companyEn}
            placeholder="e.g. M-Tech Innovation Co., Ltd."
            invalid={Boolean(error) && !hasCompanyName({ companyTh, companyEn })}
            onChange={(event) => {
              setCompanyEn(event.target.value);
              setError(null);
            }}
          />
        </div>
      </section>

      <section className="rounded-xl border border-line bg-sunken p-3.5 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="flex items-center gap-2 font-mono text-[10px] tracking-[0.14em] text-text-3 uppercase">
            <Icon name="tag" className="size-3.5" />
            ชื่อย่อบริษัท
          </h4>
          <span className="font-mono text-[10px] tabular-nums text-text-4">
            {aliases.length}/{MAX_ALIASES}
          </span>
         
        </div>

        {/* Short names are short, so the boxes run left to right and wrap —
            a column of narrow inputs left most of the card empty. The add
            button leads the row and stays first as boxes are added after it. */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={addAlias}
            disabled={atLimit}
            title={atLimit ? MESSAGES.aliasLimitReached : "เพิ่มชื่อย่อบริษัท"}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-[12.5px] font-medium transition",
              atLimit
                ? "cursor-not-allowed border-line-soft bg-surface text-text-4"
                : "border-line bg-surface text-text-2 hover:border-text-4 hover:bg-surface-2 hover:text-text",
            )}
          >
            <Icon name="plus" className="size-3.5" />
            เพิ่มชื่อย่อบริษัท
          </button>

          {aliases.map((alias, index) => {
            const blank = alias.trim() === "";
            return (
              <div
                key={index}
                className={cn(
                  "inline-flex items-center gap-1 rounded-xl border py-1 pr-1 pl-2.5 transition",
                  blank
                    ? "border-danger-line bg-danger-soft"
                    : "border-line bg-sunken focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20",
                )}
              >
                <Icon name="tag" className="size-3.5 shrink-0 text-text-3" />
                <input
                  type="text"
                  value={alias}
                  size={Math.max(alias.length, 10)}
                  autoFocus={blank}
                  placeholder={`ชื่อย่อที่ ${index + 1}`}
                  aria-label={`ชื่อย่อบริษัทที่ ${index + 1}`}
                  aria-invalid={blank ? true : undefined}
                  onChange={(event) => editAlias(index, event.target.value)}
                  className="min-w-[6rem] bg-transparent py-1 text-sm text-text focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => removeAlias(index)}
                  aria-label={`ลบชื่อย่อที่ ${index + 1}`}
                  title="ลบชื่อย่อ"
                  className="grid size-7 shrink-0 place-items-center rounded-lg text-text-3 transition hover:bg-danger-soft hover:text-danger"
                >
                  <Icon name="x" className="size-3.5" />
                </button>
              </div>
            );
          })}

          {aliases.length === 0 && (
            <p className="text-[12.5px] text-text-4">
              ยังไม่มีชื่อย่อ (เพิ่มได้ไม่เกิน {MAX_ALIASES} ชื่อ)
            </p>
          )}
        </div>
      </section>

      {error && <Alert tone="error" title={error} />}
    </Modal>
  );
}
