"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Icon } from "@/components/icons";
import { Badge, CountChip } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SearchInput, SelectField, TextField } from "@/components/ui/Field";
import { ConfirmModal, Modal } from "@/components/ui/Modal";
import { describeError } from "@/lib/services/errors";
import { lineService } from "@/lib/services/line";
import { cn, companyLabel } from "@/lib/utils";
import { useConsole } from "@/store/console-store";
import type {
  CommitDraftRequest,
  Company,
  CompanyCandidate,
  CoordinatorAction,
  CoordinatorDecision,
  DraftComparison,
  DraftContact,
  LineSummaryDraft,
} from "@/types";

/**
 * กลุ่มไลน์ที่สรุปแล้วแต่ยังไม่รู้ว่าเป็นบริษัทไหน
 *
 * The extraction pass no longer creates a company for a group that has none:
 * `employees.company_id` is NOT NULL and cannot be moved afterwards, so a wrong
 * guess ("this is a new company") would strand the coordinators on a duplicate.
 * Instead the summary is parked in `line_summary_drafts`, and this section asks
 * the user to bind it to an existing company or to create a new one. Only then
 * are the company link and the employees written, in one transaction.
 *
 * Re-read whenever the store finishes a sync (`lastSyncedAt`), which covers
 * the "สรุปข้อมูลจากไลน์" press that produces new drafts.
 */
export function SummaryDraftsSection() {
  const { lastSyncedAt, sync, reloadEmployees, notify } = useConsole();
  const [drafts, setDrafts] = useState<LineSummaryDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<LineSummaryDraft | null>(null);
  const [discarding, setDiscarding] = useState<LineSummaryDraft | null>(null);
  const [discardWorking, setDiscardWorking] = useState(false);

  const load = useCallback(async () => {
    try {
      setDrafts(await lineService.listSummaryDrafts());
    } catch (error) {
      console.error("GET /line/summary-drafts failed", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    lineService
      .listSummaryDrafts()
      .then((items) => {
        if (!cancelled) setDrafts(items);
      })
      .catch((error) => console.error("GET /line/summary-drafts failed", error))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lastSyncedAt]);

  /** After a commit the group now has a company and new pending people. */
  async function afterCommit() {
    setResolving(null);
    await Promise.all([load(), sync("groups"), reloadEmployees()]);
  }

  async function handleDiscard() {
    if (!discarding) return;
    setDiscardWorking(true);
    try {
      await lineService.discardSummaryDraft(discarding.id);
      notify({ kind: "success", message: "ทิ้งร่างผลสรุปแล้ว" });
      setDiscarding(null);
      await load();
    } catch (error) {
      notify({ kind: "error", message: errorText(error, "ทิ้งร่างไม่สำเร็จ") });
    } finally {
      setDiscardWorking(false);
    }
  }

  if (loading || drafts.length === 0) return null;

  return (
    <section className="mt-7 rounded-2xl border border-warn-line bg-warn-soft p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <Icon name="building" className="size-4 text-warn" />
        <h2 className="font-display text-[15px] font-semibold text-text">
          รอเลือกบริษัท
        </h2>
        <CountChip tone="pending">{drafts.length}</CountChip>
      </div>
      <p className="mt-1 text-[13px] text-text-2">
        กลุ่มไลน์เหล่านี้ยังไม่ได้ผูกบริษัท กรุณาเลือกว่าเป็นบริษัทที่มีอยู่แล้ว หรือสร้างบริษัทใหม่
      </p>

      <ul className="mt-4 space-y-2.5">
        {drafts.map((draft) => (
          <DraftRow
            key={draft.id}
            draft={draft}
            onResolve={() => setResolving(draft)}
            onDiscard={() => setDiscarding(draft)}
          />
        ))}
      </ul>

      {resolving && (
        <ResolveDraftModal
          draft={resolving}
          onClose={() => setResolving(null)}
          onDone={afterCommit}
        />
      )}

      <ConfirmModal
        open={discarding !== null}
        icon="trash"
        tone="danger"
        title="ทิ้งร่างผลสรุปนี้?"
        confirmLabel="ทิ้งร่าง"
        loading={discardWorking}
        onConfirm={handleDiscard}
        onCancel={() => setDiscarding(null)}
      >
        ผู้ประสานงาน {discarding?.contacts.length ?? 0} คนที่สรุปได้จากกลุ่ม “
        {discarding?.groupName ?? "-"}” จะไม่ถูกบันทึก และข้อความที่อ่านไปแล้ว
        จะไม่ถูกสรุปซ้ำ
      </ConfirmModal>
    </section>
  );
}

function errorText(error: unknown, prefix: string): string {
  return describeError(error, prefix, {
    network: `${prefix}: เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบการเชื่อมต่อ`,
    unknown: `${prefix} กรุณาลองใหม่อีกครั้ง`,
  });
}

function contactName(person: DraftContact): string {
  const name = person.nameTh || person.nameEn;
  if (name && person.nickname) return `${name} (${person.nickname})`;
  return name || person.nickname || "-";
}

function DraftRow({
  draft,
  onResolve,
  onDiscard,
}: {
  draft: LineSummaryDraft;
  onResolve: () => void;
  onDiscard: () => void;
}) {
  const { primary } = companyLabel(draft);
  const top = draft.candidates[0];

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-3.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-medium text-text">
          {draft.groupName || "<ไม่มีชื่อกลุ่ม>"}
        </p>
        <p className="mt-0.5 truncate text-[12px] text-text-3">
          AI สรุปชื่อบริษัทได้: {primary ?? "ไม่พบชื่อบริษัท"} · ผู้ประสานงาน{" "}
          {draft.contacts.length} คน
          {draft.contacts.length > 0 &&
            ` — ${draft.contacts.slice(0, 3).map(contactName).join(", ")}${
              draft.contacts.length > 3 ? " …" : ""
            }`}
        </p>
        {top && (
          <p className="mt-1 flex items-center gap-1.5 text-[12px] text-warn">
            <Icon name="alert" className="size-3.5" />
            อาจเป็นบริษัทเดิม: {companyLabel(top).primary ?? `#${top.companyId}`}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" icon="trash" onClick={onDiscard}>
          ทิ้ง
        </Button>
        <Button size="sm" variant="primary" icon="link" onClick={onResolve}>
          เลือกบริษัท
        </Button>
      </div>
    </li>
  );
}

type Choice = { kind: "existing"; companyId: number } | { kind: "new" };

/** Per-coordinator pick, keyed by the contact's index in the draft. */
type Decision = { action: CoordinatorAction; employeeId?: number | null };

/** Defaults: everyone is new for a new company; the server's guess otherwise. */
function initialDecisions(
  draft: LineSummaryDraft,
  comparison: DraftComparison | null,
): Record<number, Decision> {
  if (comparison) {
    return Object.fromEntries(
      comparison.matches.map((m) => [
        m.index,
        { action: m.suggestedAction, employeeId: m.employeeId },
      ]),
    );
  }
  return Object.fromEntries(draft.contacts.map((_, i) => [i, { action: "create" }]));
}

function ResolveDraftModal({
  draft,
  onClose,
  onDone,
}: {
  draft: LineSummaryDraft;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const { companies, notify } = useConsole();

  // ค่าเริ่มต้น: ถ้าคะแนนสูงมาก น่าจะเป็นบริษัทเดิม ให้เลือกไว้ก่อน ไม่งั้นให้ user เลือกเอง
  const [choice, setChoice] = useState<Choice | null>(() => {
    const top = draft.candidates[0];
    if (top && top.score >= 0.85) return { kind: "existing", companyId: top.companyId };
    if (draft.candidates.length === 0) return { kind: "new" };
    return null;
  });
  const [term, setTerm] = useState("");
  const [nameTh, setNameTh] = useState(draft.companyTh ?? "");
  const [nameEn, setNameEn] = useState(draft.companyEn ?? "");
  const [working, setWorking] = useState(false);
  // ขั้นที่ 2: เทียบผู้ประสานงานในร่างกับคนที่มีอยู่แล้วในบริษัทที่เลือก
  const [comparison, setComparison] = useState<DraftComparison | null>(null);
  const [comparing, setComparing] = useState(choice?.kind === "existing");
  const [compareError, setCompareError] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<number, Decision>>(() =>
    initialDecisions(draft, null),
  );

  /** Changing the company throws away the per-person picks made against the old one. */
  // bumped on every pick so re-picking the same company (e.g. after a failed
  // compare) fetches again instead of waiting on an effect that never re-runs
  const [compareRun, setCompareRun] = useState(0);

  function choose(next: Choice) {
    setChoice(next);
    setCompareRun((n) => n + 1);
    setComparison(null);
    setCompareError(null);
    setDecisions(initialDecisions(draft, null));
    setComparing(next.kind === "existing");
  }

  const existingCompanyId = choice?.kind === "existing" ? choice.companyId : null;
  useEffect(() => {
    if (existingCompanyId === null) return;
    let cancelled = false;
    lineService
      .compareSummaryDraft(draft.id, existingCompanyId)
      .then((result) => {
        if (cancelled) return;
        setComparison(result);
        setDecisions(initialDecisions(draft, result));
      })
      .catch((error) => {
        if (!cancelled) setCompareError(errorText(error, "เทียบรายชื่อไม่สำเร็จ"));
      })
      .finally(() => {
        if (!cancelled) setComparing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [draft, existingCompanyId, compareRun]);

  const candidateIds = useMemo(
    () => new Set(draft.candidates.map((c) => c.companyId)),
    [draft.candidates],
  );

  // ค้นหาบริษัทอื่นนอกจากที่ระบบเดาให้ - ไม่แสดงอะไรจนกว่าจะพิมพ์
  const searchResults = useMemo(() => {
    const needle = term.trim().toLowerCase();
    if (!needle) return [];
    return companies
      .filter((c) => !candidateIds.has(c.id))
      .filter((c) =>
        [c.companyTh, c.companyEn, ...(c.aliases ?? [])].some((n) =>
          n?.toLowerCase().includes(needle),
        ),
      )
      .slice(0, 8);
  }, [companies, candidateIds, term]);

  const selectedCompany: Company | CompanyCandidate | undefined =
    choice?.kind === "existing"
      ? (draft.candidates.find((c) => c.companyId === choice.companyId) ??
        companies.find((c) => c.id === choice.companyId))
      : undefined;
  const movesGroup = Boolean(
    selectedCompany?.groupId && selectedCompany.groupId !== draft.groupId,
  );
  const newNameMissing = choice?.kind === "new" && !nameTh.trim() && !nameEn.trim();
  // ผูกบริษัทเดิมได้ก็ต่อเมื่อเทียบรายชื่อเสร็จแล้ว ไม่งั้น user ยังไม่เห็นว่าใครซ้ำ
  const waitingForCompare = choice?.kind === "existing" && (comparing || !comparison);

  async function handleConfirm() {
    if (!choice || working || newNameMissing || waitingForCompare) return;
    setWorking(true);
    const coordinators: CoordinatorDecision[] = draft.contacts.map((_, index) => {
      const d = decisions[index] ?? { action: "create" };
      return d.action === "link"
        ? { index, action: "link", employeeId: d.employeeId }
        : { index, action: d.action };
    });
    const body: CommitDraftRequest =
      choice.kind === "existing"
        ? { mode: "existing", companyId: choice.companyId, coordinators }
        : {
            mode: "new",
            company: {
              companyTh: nameTh.trim() || null,
              companyEn: nameEn.trim() || null,
              aliases: draft.aliases ?? null,
            },
            coordinators,
          };
    try {
      const result = await lineService.commitSummaryDraft(draft.id, body);
      const extra = [
        result.linkedEmployees > 0 ? `ผูกกับคนเดิม ${result.linkedEmployees} คน` : null,
        result.skippedDuplicates > 0 ? `ข้าม ${result.skippedDuplicates} คน` : null,
      ].filter(Boolean);
      const skipped = extra.length ? ` (${extra.join(", ")})` : "";
      notify({
        kind: "success",
        message: `${result.companyCreated ? "สร้างบริษัทใหม่และ" : ""}บันทึกผู้ประสานงาน ${result.createdEmployees} คนเข้ารายการรออนุมัติแล้ว${skipped}`,
      });
      await onDone();
    } catch (error) {
      // ปิดไม่ได้: ให้ user เปลี่ยนตัวเลือกแล้วลองใหม่ เช่น ชื่อบริษัทซ้ำ -> เลือกผูกแทน
      notify({ kind: "error", message: errorText(error, "บันทึกไม่สำเร็จ") });
    } finally {
      setWorking(false);
    }
  }

  return (
    <Modal
      open
      icon="building"
      maxWidth="680px"
      title={`เลือกบริษัทของกลุ่ม: ${draft.groupName || "<ไม่มีชื่อกลุ่ม>"}`}
      subtitle="ผู้ประสานงานจะถูกบันทึกเข้าบริษัทที่เลือก และย้ายบริษัททีหลังไม่ได้ กรุณาตรวจให้แน่ใจ"
      onClose={onClose}
      closeDisabled={working}
      footer={
        <>
          <Button disabled={working} onClick={onClose}>
            ยกเลิก
          </Button>
          <Button
            variant="primary"
            icon={choice?.kind === "new" ? "plus" : "link"}
            loading={working}
            className="ml-auto"
            disabled={!choice || newNameMissing || waitingForCompare}
            onClick={handleConfirm}
          >
            {working
              ? "กำลังบันทึก..."
              : choice?.kind === "new"
                ? "ยืนยันการสร้างบริษัทใหม่"
                : "ยืนยันการผูกกับบริษัท"}
          </Button>
        </>
      }
    >
      {draft.candidates.length > 0 && (
        <div className="space-y-2">
          <p className="font-mono text-[10px] tracking-[0.14em] text-text-4 uppercase">
            บริษัทในระบบที่น่าจะเป็นบริษัทเดียวกัน
          </p>
          <ul className="space-y-2">
            {draft.candidates.map((c) => (
              <CompanyOption
                key={c.companyId}
                company={{ id: c.companyId, companyTh: c.companyTh, companyEn: c.companyEn, groupId: c.groupId }}
                score={c.score}
                reasons={c.reasons}
                picked={choice?.kind === "existing" && choice.companyId === c.companyId}
                disabled={working}
                onPick={() => choose({ kind: "existing", companyId: c.companyId })}
              />
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2">
        <p className="font-mono text-[10px] tracking-[0.14em] text-text-4 uppercase">
          ค้นหาบริษัท
        </p>
        <SearchInput
          size="sm"
          value={term}
          onValueChange={setTerm}
          onClear={() => setTerm("")}
          placeholder="ค้นหาด้วยชื่อบริษัท / ชื่อย่อ..."
        />
        {term.trim() !== "" &&
          (searchResults.length === 0 ? (
            <p className="text-[12px] text-text-3">ไม่พบบริษัทที่ตรงกับ “{term.trim()}”</p>
          ) : (
            <ul className="max-h-56 space-y-2 overflow-y-auto">
              {searchResults.map((c) => (
                <CompanyOption
                  key={c.id}
                  company={c}
                  picked={choice?.kind === "existing" && choice.companyId === c.id}
                  disabled={working}
                  onPick={() => choose({ kind: "existing", companyId: c.id })}
                />
              ))}
            </ul>
          ))}
      </div>

      <div
        className={cn(
          "rounded-xl border p-3.5 transition",
          choice?.kind === "new" ? "border-accent bg-accent-soft" : "border-line bg-surface",
        )}
      >
        <label className="flex cursor-pointer items-center gap-2.5">
          <input
            type="radio"
            name={`draft-${draft.id}`}
            checked={choice?.kind === "new"}
            disabled={working}
            onChange={() => choose({ kind: "new" })}
            className="accent-accent"
          />
          <span className="text-[13.5px] font-medium text-text">
            สร้างบริษัทใหม่
          </span>
        </label>
        {choice?.kind === "new" && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <TextField
              label="ชื่อบริษัท (ไทย)"
              value={nameTh}
              disabled={working}
              invalid={newNameMissing}
              onChange={(e) => setNameTh(e.target.value)}
            />
            <TextField
              label="ชื่อบริษัท (อังกฤษ)"
              value={nameEn}
              disabled={working}
              invalid={newNameMissing}
              onChange={(e) => setNameEn(e.target.value)}
            />
            {newNameMissing && (
              <p className="text-[12px] text-danger sm:col-span-2">
                กรุณาระบุชื่อบริษัทอย่างน้อยหนึ่งภาษา
              </p>
            )}
          </div>
        )}
      </div>

      {/* <CoordinatorReview
        draft={draft}
        choice={choice}
        comparison={comparison}
        comparing={comparing}
        compareError={compareError}
        decisions={decisions}
        disabled={working}
        onChange={(index, decision) =>
          setDecisions((prev) => ({ ...prev, [index]: decision }))
        }
      /> */}

      {movesGroup && (
        <p className="flex items-start gap-1.5 rounded-xl border border-warn-line bg-warn-soft p-3 text-[12.5px] text-warn">
          <Icon name="alert" className="mt-0.5 size-3.5 shrink-0" />
          บริษัทนี้ผูกกับกลุ่มไลน์อื่นอยู่ ถ้ายืนยัน บริษัทจะย้ายมาผูกกับกลุ่มนี้แทน
          และกลุ่มเดิมจะกลายเป็นกลุ่มที่ยังไม่ได้ผูกบริษัท
        </p>
      )}
    </Modal>
  );
}

function CompanyOption({
  company,
  score,
  reasons,
  picked,
  disabled,
  onPick,
}: {
  company: Pick<Company, "id" | "companyTh" | "companyEn"> & { groupId?: string | null };
  score?: number;
  reasons?: string[];
  picked: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  const { primary, secondary } = companyLabel(company);
  return (
    <li>
      <button
        type="button"
        disabled={disabled}
        aria-pressed={picked}
        onClick={onPick}
        className={cn(
          "flex w-full cursor-pointer items-center gap-3 rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60",
          picked
            ? "border-accent bg-accent-soft"
            : "border-line bg-surface hover:border-text-4 hover:bg-surface-2",
        )}
      >
        <Icon
          name={picked ? "check-circle" : "building"}
          className={cn("size-4 shrink-0", picked ? "text-accent" : "text-text-3")}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] text-text">
            {primary ?? `บริษัท #${company.id}`}
            {secondary && <span className="text-text-3"> · {secondary}</span>}
          </p>
          {(reasons?.length || company.groupId) && (
            <p className="mt-0.5 truncate text-[12px] text-text-3">
              {[...(reasons ?? []), company.groupId ? "ผูกกับกลุ่มไลน์อื่นอยู่" : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
        {score !== undefined && (
          <Badge tone={score >= 0.85 ? "matched" : "neutral"}>
            {Math.round(score * 100)}%
          </Badge>
        )}
      </button>
    </li>
  );
}

/**
 * ขั้นที่ 2 ของ flow: ผู้ประสานงานแต่ละคนในร่าง จะบันทึกอย่างไร
 *
 * บริษัทใหม่: แต่ละคนเลือกได้แค่ "บันทึก" หรือ "ข้าม"
 * บริษัทเดิม: แสดงคนที่มีอยู่แล้วในบริษัทนั้นเป็นตัวเลือก "คนเดิม" ด้วย
 * โดยตั้งค่าเริ่มต้นตามที่ระบบเดา (อีเมล / เบอร์ / ชื่อตรงกัน)
//  */
// function CoordinatorReview({
//   draft,
//   choice,
//   comparison,
//   comparing,
//   compareError,
//   decisions,
//   disabled,
//   onChange,
// }: {
//   draft: LineSummaryDraft;
//   choice: Choice | null;
//   comparison: DraftComparison | null;
//   comparing: boolean;
//   compareError: string | null;
//   decisions: Record<number, Decision>;
//   disabled: boolean;
//   onChange: (index: number, decision: Decision) => void;
// }) {
//   const existing = comparison?.existing ?? [];
//   const matchByIndex = new Map(comparison?.matches.map((m) => [m.index, m]) ?? []);

//   const options = [
//     { value: "create", label: "คนใหม่ — บันทึก" },
//     ...existing.map((e) => ({
//       value: `link:${e.id}`,
//       label: `คนเดิม — ${contactName(e)}${e.email ? ` · ${e.email}` : ""}`,
//     })),
//     { value: "skip", label: "ข้าม — ไม่บันทึก" },
//   ];

//   function valueOf(d: Decision | undefined): string {
//     if (!d) return "create";
//     return d.action === "link" ? `link:${d.employeeId}` : d.action;
//   }

//   function parse(value: string): Decision {
//     if (value.startsWith("link:")) return { action: "link", employeeId: Number(value.slice(5)) };
//     return { action: value as CoordinatorAction };
//   }

//   return (
//     <div className="space-y-2">
//       <p className="font-mono text-[10px] tracking-[0.14em] text-text-4 uppercase">
//         ผู้ประสานงานที่สรุปได้ ({draft.contacts.length})
//         {comparison && ` · มีอยู่แล้วในบริษัทนี้ ${existing.length} คน`}
//       </p>
//       {!choice && (
//         <p className="text-[12px] text-text-3">
//           เลือกบริษัทด้านบนก่อน แล้วค่อยตรวจว่าแต่ละคนเป็นคนใหม่หรือคนเดิม
//         </p>
//       )}
//       {choice?.kind === "existing" && comparing && (
//         <p className="text-[12px] text-text-3">กำลังเทียบกับผู้ประสานงานของบริษัทนี้...</p>
//       )}
//       {compareError && <p className="text-[12px] text-danger">{compareError}</p>}

//       <ul className="max-h-72 space-y-2 overflow-y-auto">
//         {draft.contacts.map((person, index) => {
//           const decision = decisions[index];
//           const match = matchByIndex.get(index);
//           return (
//             <li
//               key={index}
//               className={cn(
//                 "grid gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_minmax(0,240px)] sm:items-center",
//                 decision?.action === "skip"
//                   ? "border-line bg-sunken opacity-70"
//                   : "border-line bg-surface",
//               )}
//             >
//               <div className="min-w-0 text-[13px] text-text-2">
//                 <p className="truncate font-medium text-text">{contactName(person)}</p>
//                 <p className="truncate text-[12px]">
//                   {[person.jobTitle, person.email, person.phone].filter(Boolean).join(" · ") ||
//                     "ไม่มีข้อมูลติดต่อ"}
//                 </p>
//                 {match?.employeeId && match.matchedBy.length > 0 && (
//                   <p className="mt-0.5 flex items-center gap-1 text-[12px] text-warn">
//                     <Icon name="alert" className="size-3.5" />
//                     น่าจะเป็นคนเดิม ({match.matchedBy.join(", ")} ตรงกัน)
//                   </p>
//                 )}
//               </div>
//               {choice && (
//                 <SelectField
//                   aria-label={`จะบันทึก ${contactName(person)} อย่างไร`}
//                   value={valueOf(decision)}
//                   disabled={disabled || (choice.kind === "existing" && !comparison)}
//                   options={choice.kind === "new" ? options.filter((o) => !o.value.startsWith("link:")) : options}
//                   onChange={(e) => onChange(index, parse(e.target.value))}
//                   className="py-2 text-[12.5px]"
//                 />
//               )}
//             </li>
//           );
//         })}
//       </ul>
//     </div>
//   );
// }
