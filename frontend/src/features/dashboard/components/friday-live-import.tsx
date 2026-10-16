"use client";

import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import { ApiError, NetworkError } from "@/lib/services/http";
import {
  FRIDAY_IMPORT_TEMPLATE_HEADERS,
  fridayImportService,
  type FridayImportBatch,
  type FridayImportDecision,
  type FridayImportNormalized,
  type FridayImportReview,
  type FridayImportRow,
  type FridayImportYearConvention,
} from "@/lib/services/friday-import";
import styles from "./friday-live-import.module.css";

type CompanyOption = { id: string; name: string };
type CommitAttempt = { revision: number; key: string; previousReceiptId: string | null };
type ReviewDecision = Exclude<FridayImportDecision, "pending">;
type CorrectableFields = Omit<FridayImportNormalized, "companyIds" | "companyName">;

const DECISIONS: Record<FridayImportDecision, string> = {
  pending: "รอตรวจ", create: "สร้างใหม่", update: "อัปเดต", skip: "ข้าม",
};
const FORMATS: Record<string, string> = {
  unknown: "ยังไม่ระบุ", talk: "บรรยาย", workshop: "Workshop",
  visit: "เยี่ยมชม", hackathon: "Hackathon", other: "อื่น ๆ",
};
const STATUSES: Record<string, string> = {
  draft: "ร่าง", contacting: "กำลังติดต่อ", invited: "ส่งคำเชิญแล้ว",
  confirmed: "ยืนยันแล้ว", in_progress: "กำลังจัด", completed: "เสร็จสิ้น", cancelled: "ยกเลิก",
};

function importError(error: unknown): string {
  if (error instanceof ApiError) {
    const descriptions: Record<number, string> = {
      401: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้งก่อนดำเนินการต่อ",
      403: "บัญชีนี้ไม่มีสิทธิ์นำเข้ากิจกรรม กรุณาให้ผู้ดูแลตรวจสิทธิ์เจ้าหน้าที่",
      404: "ไม่พบชุดนำเข้าหรือกิจกรรมที่เลือก กรุณาตรวจหมายเลขและโหลดข้อมูลอีกครั้ง",
      409: "ข้อมูลชุดนำเข้าหรือกิจกรรมเปลี่ยนไปแล้ว กรุณาโหลดสถานะล่าสุดและตรวจรายการใหม่",
      413: "ไฟล์ใหญ่เกินขนาดที่ระบบรับได้ กรุณาแบ่งไฟล์แล้วลองอีกครั้ง",
      422: "ข้อมูลนำเข้าไม่ผ่านการตรวจ กรุณาตรวจชนิดไฟล์ หัวคอลัมน์ ปี วันที่ และข้อผิดพลาดรายแถว",
    };
    const detail = error.detail.trim();
    const readable = detail && detail.length <= 600 && !/^[\[{<]/.test(detail);
    const message = descriptions[error.status] ?? `นำเข้าไม่สำเร็จ (HTTP ${error.status})`;
    return readable ? `${message}: ${detail}` : message;
  }
  if (error instanceof NetworkError) return error.message;
  return "ดำเนินการไม่สำเร็จ กรุณาลองอีกครั้ง";
}

function isReady(row: FridayImportRow): boolean {
  return row.committedActivityId === null
    && (row.decision === "create" || row.decision === "update")
    && row.errors.length === 0
    && row.mappingStatus === "matched"
    && row.normalized.companyIds.length > 0
    && (row.decision !== "update" || row.targetActivityId !== null);
}

function downloadTemplate() {
  const blob = new Blob([`\ufeff${FRIDAY_IMPORT_TEMPLATE_HEADERS.join(",")}\r\n`], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "friday-activities-template.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

function nullableNumber(value: FormDataEntryValue | null): number | null {
  return value === null || String(value).trim() === "" ? null : Number(value);
}

function rowKey(row: FridayImportRow): string {
  return JSON.stringify([
    row.id, row.normalized, row.decision, row.targetActivityId,
    row.targetActivityRevision, row.mappingStatus, row.errors,
  ]);
}

function ImportRowReview({ row, companies, companyNames, disabled, saving, onReview, onDirtyChange }: {
  row: FridayImportRow;
  companies: CompanyOption[];
  companyNames: ReadonlyMap<string, string>;
  disabled: boolean;
  saving: boolean;
  onReview: (row: FridayImportRow, payload: Omit<FridayImportReview, "expectedBatchRevision">) => Promise<boolean>;
  onDirtyChange: (rowId: string, dirty: boolean) => void;
}) {
  const id = useId();
  const [visited, setVisited] = useState(false);
  const [decision, setDecision] = useState<FridayImportDecision>(row.decision);
  const [companyIds, setCompanyIds] = useState(row.normalized.companyIds);
  const [search, setSearch] = useState("");
  const [validation, setValidation] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const correctedFields = useRef(new Set<string>());
  const formRef = useRef<HTMLFormElement>(null);
  const normalized = row.normalized;
  const searchText = search.trim().toLocaleLowerCase("th");
  const filteredCompanies = visited ? companies.filter(company =>
    companyIds.includes(company.id) || company.name.toLocaleLowerCase("th").includes(searchText),
  ) : [];
  const isSkipped = decision === "skip";

  function markDirty() {
    setDirty(true);
    onDirtyChange(row.id, true);
  }

  function resetDraft() {
    formRef.current?.reset();
    setCompanyIds(normalized.companyIds);
    setDecision(row.decision);
    setSearch("");
    setValidation(null);
    correctedFields.current.clear();
    setDirty(false);
    onDirtyChange(row.id, false);
  }

  function clearValue(name: string) {
    const input = formRef.current?.elements.namedItem(name);
    if (input instanceof HTMLInputElement) input.value = "";
    correctedFields.current.add(name);
    markDirty();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidation(null);
    if (decision === "pending") {
      setValidation("กรุณาเลือกสร้างใหม่ อัปเดต หรือข้ามแถวนี้อย่างชัดเจน");
      return;
    }
    if (!isSkipped && companyIds.length === 0) {
      setValidation("กรุณาเลือกบริษัทจากทะเบียนอย่างน้อยหนึ่งบริษัท");
      return;
    }
    const form = new FormData(event.currentTarget);
    const target = row.candidateActivities.find(candidate => candidate.id === form.get("targetActivityId"));
    if (decision === "update" && !target) {
      setValidation("กรุณาเลือกกิจกรรมปลายทางที่ต้องการอัปเดต");
      return;
    }
    const correctionValues: Partial<CorrectableFields> = {
      sourceKey: String(form.get("sourceKey") || "") || null,
      title: String(form.get("title") ?? ""),
      academicYear: nullableNumber(form.get("academicYear")),
      term: (form.get("term") || null) as FridayImportNormalized["term"],
      sessionDate: String(form.get("sessionDate") || "") || null,
      startTime: String(form.get("startTime") || "") || null,
      endTime: String(form.get("endTime") || "") || null,
      location: String(form.get("location") || "") || null,
      format: String(form.get("format") ?? "unknown"),
      status: String(form.get("status") || "") || null,
      capacity: nullableNumber(form.get("capacity")),
      booked: nullableNumber(form.get("booked")),
      attended: nullableNumber(form.get("attended")),
    };
    // Only explicit edits clear a source validation error. Sending the entire
    // normalized row would turn an invalid raw count/date into null when the
    // reviewer merely chooses a company.
    const correction = Object.fromEntries(Object.entries(correctionValues)
      .filter(([name]) => correctedFields.current.has(name))) as Partial<CorrectableFields>;
    const saved = await onReview(row, {
      decision: decision as ReviewDecision,
      companyIds,
      ...(target && decision === "update"
        ? { targetActivityId: target.id, targetActivityRevision: target.revision } : {}),
      ...(Object.keys(correction).length ? { normalized: correction } : {}),
    });
    if (saved) {
      correctedFields.current.clear();
      setDirty(false);
    }
  }

  return <details className={styles.row} onToggle={event => {
    if (event.currentTarget.open) setVisited(true);
  }}>
    <summary>
      <span className={styles.rowHeading}>
        <strong>{row.sheetName ? `${row.sheetName} · ` : ""}แถว {row.rowNumber}: {normalized.title || "ไม่มีชื่อกิจกรรม"}</strong>
        <span className={styles.badge}>{DECISIONS[row.decision]}</span>
        {row.committedActivityId ? <span className={styles.badge}>นำเข้าแล้ว</span> : null}
        {row.mappingStatus === "needs_mapping" ? <span className={styles.badge}>รอเลือกบริษัท</span> : null}
        {row.errors.length ? <span className={styles.badge}>ข้อผิดพลาด {row.errors.length}</span> : null}
        {isReady(row) ? <span className={styles.badge}>พร้อมนำเข้า</span> : null}
      </span>
    </summary>
    {visited ? <div className={styles.rowBody}>
      {row.errors.length ? <div className={styles.error}>
        <strong>{row.decision === "skip" ? "แถวนี้ถูกข้าม พร้อมข้อสังเกตจากต้นทาง" : "ต้องตรวจและแก้ไขก่อนนำเข้า"}</strong>
        <ul>{row.errors.map((error, index) => <li key={index}>{error}</li>)}</ul>
      </div> : null}
      <details className={styles.raw}>
        <summary>ดูข้อมูลดิบจากไฟล์และตำแหน่งต้นทาง</summary>
        <div className={styles.rawScroll} tabIndex={0} role="region" aria-label={`ข้อมูลดิบแถว ${row.rowNumber}`}>
          <table><caption className={styles.caption}>{row.sheetName || "CSV"} · แถว {row.rowNumber}</caption><tbody>
            {Object.entries(row.raw).map(([name, value]) => <tr key={name}><th scope="row">{name}</th><td>{value === null || value === "" ? "(ว่าง)" : value}</td></tr>)}
          </tbody></table>
        </div>
      </details>
      <p className={styles.caption}>ค่าหลังแปลงจากไฟล์อยู่ด้านล่าง ตรวจความหมายก่อนบันทึกผลตรวจทุกแถว ปีและวันที่ในฟอร์มนี้ใช้ ค.ศ.</p>
      <form ref={formRef} onSubmit={submit} noValidate={isSkipped} onChange={event => {
        const field = event.target;
        if ((field instanceof HTMLInputElement || field instanceof HTMLSelectElement) && field.name) {
          correctedFields.current.add(field.name);
          markDirty();
        }
      }}>
        <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: "12px 0", minWidth: 0 }}>
          <legend className={styles.caption}>ข้อมูลกิจกรรมหลังแปลง</legend>
          <div className={styles.grid}>
            <label className={`${styles.field} ${styles.full}`}><span>ชื่อกิจกรรม</span><input name="title" defaultValue={normalized.title} required={!isSkipped} /></label>
            <label className={styles.field}><span>ปีการศึกษา (ค.ศ.)</span><input name="academicYear" type="number" step="1" min="2000" max="2100" defaultValue={normalized.academicYear ?? ""} required={!isSkipped} /></label>
            <label className={styles.field}><span>ภาคการศึกษา</span><select name="term" defaultValue={normalized.term ?? ""} required={!isSkipped}>
              <option value="">กรุณาเลือก</option><option value="FIRST">ภาคต้น</option><option value="SECOND">ภาคปลาย</option><option value="SUMMER">ภาคฤดูร้อน</option>
            </select></label>
            <label className={styles.field}><span>สถานะกิจกรรม</span><select name="status" defaultValue={normalized.status ?? ""} required={!isSkipped}>
              <option value="">ยังไม่ระบุ</option>{Object.entries(STATUSES).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              {normalized.status && !STATUSES[normalized.status] ? <option value={normalized.status}>ต้องแก้ไข: {normalized.status}</option> : null}
            </select></label>
            <div className={styles.field}><label htmlFor={`${id}-date`}>วันที่จัด (ค.ศ.)</label><input id={`${id}-date`} name="sessionDate" type="date" defaultValue={normalized.sessionDate ?? ""} /><button type="button" className="text-button" onClick={() => clearValue("sessionDate")}>ระบุว่ายังไม่ทราบวันที่</button></div>
            <div className={styles.field}><label htmlFor={`${id}-start`}>เวลาเริ่ม</label><input id={`${id}-start`} name="startTime" type="time" defaultValue={normalized.startTime ?? ""} /><button type="button" className="text-button" onClick={() => clearValue("startTime")}>ระบุว่ายังไม่ทราบเวลา</button></div>
            <div className={styles.field}><label htmlFor={`${id}-end`}>เวลาสิ้นสุด</label><input id={`${id}-end`} name="endTime" type="time" defaultValue={normalized.endTime ?? ""} /><button type="button" className="text-button" onClick={() => clearValue("endTime")}>ระบุว่ายังไม่ทราบเวลา</button></div>
            <label className={styles.field}><span>รูปแบบ</span><select name="format" defaultValue={normalized.format}>
              {Object.entries(FORMATS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              {!FORMATS[normalized.format] ? <option value={normalized.format}>ต้องแก้ไข: {normalized.format}</option> : null}
            </select></label>
            <label className={`${styles.field} ${styles.full}`}><span>สถานที่</span><input name="location" defaultValue={normalized.location ?? ""} /></label>
            {([["capacity", "จำนวนรับ"], ["booked", "จำนวนจอง"], ["attended", "จำนวนมาจริง"]] as const).map(([key, label]) =>
              <div className={styles.field} key={key}><label htmlFor={`${id}-${key}`}>{label}</label><input id={`${id}-${key}`} name={key} type="number" min="0" max="2147483647" step="1" defaultValue={normalized[key] ?? ""} /><button className="text-button" type="button" onClick={() => clearValue(key)}>ระบุว่ายังไม่ทราบจำนวน</button></div>,
            )}
            <p className={`${styles.caption} ${styles.full}`}>เว้นว่าง = ยังไม่ทราบจำนวน · 0 = ไม่มีคน · สถานะไม่เปลี่ยนเป็นเสร็จสิ้นตามวันที่โดยอัตโนมัติ</p>
            <label className={`${styles.field} ${styles.full}`}><span>รหัสกิจกรรมต้นทาง (sourceKey)</span><input name="sourceKey" defaultValue={normalized.sourceKey ?? ""} maxLength={200} /><small className={styles.caption}>ใช้รหัสเดิมเมื่อเป็นกิจกรรมเดิม เพื่อช่วยตรวจการนำเข้าซ้ำและเลือกกิจกรรมที่จะอัปเดต</small></label>
            <fieldset className={`${styles.companyField} ${styles.full}`}>
              <legend>บริษัทจากทะเบียนกลาง (เลือกได้หลายบริษัท)</legend>
              <p className={styles.caption}>ชื่อในไฟล์: {normalized.companyName || "ไม่ระบุ"} · ไม่รวมบริษัทเข้าด้วยกันจากชื่อที่คล้ายกัน</p>
              <p className={styles.caption}>เลือกแล้ว: {companyIds.length ? companyIds.map(companyId => companyNames.get(companyId) ?? `บริษัทที่ไม่พบในทะเบียน (${companyId})`).join(", ") : "ยังไม่ได้เลือก"}</p>
              <label className={styles.field} htmlFor={`${id}-company-search`}><span>ค้นหาบริษัท</span><input id={`${id}-company-search`} type="search" value={search} onChange={event => setSearch(event.target.value)} /></label>
              <div className={styles.companyOptions} role="group" aria-label="รายชื่อบริษัทจากทะเบียน">
                {filteredCompanies.map(company => <label className={styles.companyOption} key={company.id}>
                  <input type="checkbox" name="companyIds" checked={companyIds.includes(company.id)} onChange={event => setCompanyIds(current =>
                    event.target.checked ? [...current, company.id] : current.filter(companyId => companyId !== company.id),
                  )} />{company.name}
                </label>)}
                {companyIds.filter(companyId => !companyNames.has(companyId)).map(companyId => <label className={styles.companyOption} key={companyId}>
                  <input type="checkbox" name="companyIds" checked onChange={() => setCompanyIds(current => current.filter(value => value !== companyId))} />บริษัทที่ไม่พบในทะเบียน ({companyId}) · เอาเครื่องหมายออกแล้วเลือกบริษัทใหม่
                </label>)}
                {filteredCompanies.length === 0 ? <p className={styles.caption}>ไม่พบบริษัทที่ตรงกับคำค้น กรุณาตรวจทะเบียนบริษัทก่อนนำเข้า</p> : null}
              </div>
            </fieldset>
            <label className={styles.field}><span>ผลตรวจแถวนี้</span><select name="decision" value={decision} onChange={event => setDecision(event.target.value as FridayImportDecision)} required>
              <option value="pending">ยังไม่ตรวจ</option><option value="create">สร้างกิจกรรมใหม่</option><option value="update">อัปเดตกิจกรรมเดิม</option><option value="skip">ข้ามแถวนี้</option>
            </select></label>
            {decision === "update" ? <label className={`${styles.field} ${styles.full}`}><span>กิจกรรมเดิมที่จะอัปเดต</span><select name="targetActivityId" defaultValue={row.targetActivityId ?? ""} required>
              <option value="">เลือกกิจกรรมปลายทาง</option>{row.candidateActivities.map(candidate => <option value={candidate.id} key={candidate.id}>{candidate.title} · รุ่น {candidate.revision}</option>)}
            </select>{row.candidateActivities.length === 0 ? <small className={styles.caption}>ไม่พบกิจกรรมที่เชื่อมกับรหัสต้นทางหรือชื่อในภาคการศึกษานี้ กรุณาตรวจไฟล์ หรือเลือกสร้างใหม่/ข้าม</small> : null}</label> : null}
          </div>
          {validation ? <p className={styles.error} role="alert">{validation}</p> : null}
          <div className={styles.rowActions}>
            <button className="secondary-button" type="submit" disabled={disabled || decision === "pending"}>{saving ? "กำลังบันทึกผลตรวจ…" : "บันทึกผลตรวจแถวนี้"}</button>
            {dirty ? <button className="text-button" type="button" onClick={resetDraft}>ทิ้งการแก้ไขที่ยังไม่บันทึก</button> : null}
            <span className={styles.caption}>{dirty ? "มีการแก้ไขที่ยังไม่บันทึกผลตรวจ" : `ผลตรวจล่าสุด: ${DECISIONS[row.decision]}`}</span>
          </div>
        </fieldset>
      </form>
    </div> : null}
  </details>;
}

export function FridayLiveImport({ companies, onCommitted, onClose }: {
  companies: CompanyOption[];
  onCommitted: () => void;
  onClose: () => void;
}) {
  const id = useId();
  const [file, setFile] = useState<File | null>(null);
  const [yearConvention, setYearConvention] = useState<FridayImportYearConvention>("AD");
  const [batchId, setBatchId] = useState("");
  const [batch, setBatch] = useState<FridayImportBatch | null>(null);
  const [busy, setBusy] = useState<"preview" | "load" | "commit" | "review" | null>(null);
  const [reviewingRow, setReviewingRow] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [attempt, setAttempt] = useState<CommitAttempt | null>(null);
  const [dirtyRows, setDirtyRows] = useState<Set<string>>(() => new Set());
  const [reloadEpoch, setReloadEpoch] = useState(0);
  const companyNames = useMemo(() => new Map(companies.map(company => [company.id, company.name])), [companies]);

  const rows = batch?.rows ?? [];
  const ready = rows.filter(isReady).length;
  const pending = rows.filter(row => row.decision === "pending").length;
  const rejected = rows.filter(row => row.errors.length > 0 && row.decision !== "skip").length;
  const skipped = rows.filter(row => row.decision === "skip").length;
  const unmapped = rows.filter(row => row.mappingStatus === "needs_mapping" && row.decision !== "skip").length;
  const imported = rows.filter(row => row.committedActivityId !== null).length;
  const selectedBlocked = rows.filter(row => row.committedActivityId === null && (row.decision === "create" || row.decision === "update") && !isReady(row)).length;
  const hasReceipt = Boolean(batch?.receipt);
  const isComplete = batch?.status === "committed";
  const hasDrafts = dirtyRows.size > 0;
  const canCommit = batch?.status === "preview" && (ready > 0 || (pending === 0 && skipped > 0)) && selectedBlocked === 0 && !stale && !hasDrafts;

  function markRowDirty(rowId: string, dirty: boolean) {
    setDirtyRows(current => {
      if (current.has(rowId) === dirty) return current;
      const next = new Set(current);
      if (dirty) next.add(rowId); else next.delete(rowId);
      return next;
    });
  }

  function receiveBatch(next: FridayImportBatch, confirmedReceipt = false) {
    setBatch(next);
    setBatchId(next.id);
    setStale(false);
    if (confirmedReceipt && next.receipt) {
      setUncertain(false);
      setAttempt(null);
      onCommitted();
    }
  }

  async function preview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || busy || uncertain || hasDrafts) return;
    setError(null);
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (extension !== "csv" && extension !== "xlsx") {
      setError("กรุณาเลือกไฟล์ .csv หรือ .xlsx เท่านั้น");
      return;
    }
    setBusy("preview");
    try {
      const next = await fridayImportService.preview(file, yearConvention);
      setAttempt(null);
      setUncertain(false);
      setDirtyRows(new Set());
      receiveBatch(next);
    } catch (caught) {
      setError(importError(caught));
    } finally {
      setBusy(null);
    }
  }

  async function loadBatch(loadId: string) {
    if (busy || !loadId.trim()) return;
    setBusy("load");
    setError(null);
    try {
      const next = await fridayImportService.get(loadId.trim());
      setDirtyRows(new Set());
      setReloadEpoch(current => current + 1);
      const confirmsAttempt = !uncertain || !attempt || next.receipt?.id !== attempt.previousReceiptId;
      receiveBatch(next, Boolean(next.receipt) && confirmsAttempt);
    } catch (caught) {
      setError(importError(caught));
    } finally {
      setBusy(null);
    }
  }

  async function review(row: FridayImportRow, payload: Omit<FridayImportReview, "expectedBatchRevision">): Promise<boolean> {
    if (!batch || busy || uncertain || stale || isComplete || row.committedActivityId !== null) return false;
    setBusy("review");
    setReviewingRow(row.id);
    setError(null);
    try {
      receiveBatch(await fridayImportService.review(batch.id, row.id, {
        ...payload, expectedBatchRevision: batch.revision,
      }));
      markRowDirty(row.id, false);
      return true;
    } catch (caught) {
      setError(importError(caught));
      if (caught instanceof ApiError && caught.status === 409) setStale(true);
      return false;
    } finally {
      setBusy(null);
      setReviewingRow(null);
    }
  }

  async function commit() {
    if (!batch || busy || (!canCommit && !uncertain)) return;
    const currentAttempt = attempt ?? {
      revision: batch.revision,
      key: `friday-import-${batch.id}-revision-${batch.revision}`,
      previousReceiptId: batch.receipt?.id ?? null,
    };
    setAttempt(currentAttempt);
    setBusy("commit");
    setError(null);
    try {
      const next = await fridayImportService.commit(batch.id, currentAttempt.revision, currentAttempt.key);
      if (!next.receipt) throw new Error("Import response did not include a receipt");
      receiveBatch(next, true);
    } catch (caught) {
      const unknownResult = !(caught instanceof ApiError) || caught.status >= 500 || caught.status === 408;
      setUncertain(unknownResult);
      if (!unknownResult) setAttempt(null);
      setError(importError(caught));
      if (caught instanceof ApiError && caught.status === 409) setStale(true);
    } finally {
      setBusy(null);
    }
  }

  return <section className={`panel ${styles.panel}`} aria-labelledby={`${id}-title`} aria-busy={busy !== null}>
    <div className={styles.heading}>
      <div><h2 id={`${id}-title`}>นำเข้า Friday Activity</h2><p className={styles.caption}>อัปโหลด CSV หรือ Excel เพื่อตรวจและจับคู่บริษัทก่อนบันทึกลงฐานข้อมูลกลาง</p></div>
      <button type="button" className="secondary-button" onClick={onClose} disabled={busy !== null || uncertain || hasDrafts}>ปิดการนำเข้า</button>
    </div>
    <div className={styles.actions}><button type="button" className="secondary-button" onClick={downloadTemplate}>ดาวน์โหลดแม่แบบ CSV</button></div>
    <p className={styles.caption}>Excel ใช้หัวคอลัมน์เดียวกับแม่แบบ · term: FIRST/SECOND/SUMMER · format: talk/workshop/visit/hackathon/other/unknown · status: draft/contacting/invited/confirmed/in_progress/completed/cancelled</p>
    <p className={styles.caption}>กำหนด sourceKey ที่คงเดิมสำหรับกิจกรรมเดิม เพื่อแยกการอัปเดตจากการสร้างใหม่ · วันที่ sessionDate ใช้ ค.ศ. รูปแบบ YYYY-MM-DD และเวลา HH:MM เสมอ</p>
    <div className={styles.forms}>
      <form className={styles.form} onSubmit={preview}>
        <label><span>ไฟล์กิจกรรม (.csv / .xlsx)</span><input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required disabled={busy !== null || uncertain || hasDrafts} onChange={event => setFile(event.target.files?.[0] ?? null)} /></label>
        <label><span>ระบบปีของคอลัมน์ academicYear ในไฟล์</span><select value={yearConvention} disabled={busy !== null || uncertain || hasDrafts} onChange={event => setYearConvention(event.target.value as FridayImportYearConvention)}>
          <option value="AD">ค.ศ. (เช่น 2026)</option><option value="BE">พ.ศ. (เช่น 2569)</option>
        </select></label>
        <p className={styles.caption}>ระบบจะแปลงปีการศึกษา พ.ศ. เป็น ค.ศ. เมื่อเลือก พ.ศ. เท่านั้น ตรวจตัวเลือกนี้ให้ตรงกับไฟล์ก่อนสร้างตัวอย่าง การเลือกนี้ไม่เปลี่ยนปีในวันที่ ISO</p>
        <div className={styles.actions}><button type="submit" className="primary-button" disabled={!file || busy !== null || uncertain || hasDrafts}>{busy === "preview" ? "กำลังอ่านไฟล์…" : "สร้างตัวอย่างเพื่อตรวจ"}</button></div>
      </form>
      <form className={styles.form} onSubmit={event => { event.preventDefault(); void loadBatch(batchId); }}>
        <label><span>เปิดชุดนำเข้าที่ตรวจไว้แล้ว</span><input value={batchId} onChange={event => setBatchId(event.target.value)} placeholder="หมายเลขชุดนำเข้า" disabled={busy !== null || uncertain || hasDrafts} /></label>
        <div className={styles.actions}><button type="submit" className="secondary-button" disabled={!batchId.trim() || busy !== null || uncertain || hasDrafts}>เปิดชุดนำเข้า</button></div>
      </form>
    </div>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {hasDrafts ? <p className={styles.notice} role="status">มี {dirtyRows.size} แถวที่แก้ไขแต่ยังไม่บันทึกผลตรวจ บันทึกหรือทิ้งการแก้ไขในแต่ละแถวก่อนยืนยันนำเข้า เปลี่ยนชุดนำเข้า หรือปิดหน้าต่างนี้</p> : null}
    {busy ? <p className={styles.caption} role="status">{busy === "commit" ? "กำลังรอผลบันทึกจากเซิร์ฟเวอร์…" : busy === "review" ? "กำลังบันทึกผลตรวจแถว…" : "กำลังโหลดข้อมูลจากเซิร์ฟเวอร์…"}</p> : null}
    {uncertain ? <div className={styles.notice} role="alert">
      <strong>ยังยืนยันผลบันทึกไม่ได้</strong><p>การเชื่อมต่อขาดหรือเซิร์ฟเวอร์ไม่ตอบ ระบบอาจบันทึกแล้ว กรุณาตรวจใบรับผลหรือลองคำขอเดิมอีกครั้ง ปุ่มลองใหม่ใช้รหัสคำขอเดิมเพื่อป้องกันข้อมูลซ้ำ</p>
      <div className={styles.actions}><button className="secondary-button" type="button" disabled={busy !== null} onClick={() => batch && void loadBatch(batch.id)}>ตรวจใบรับผลล่าสุด</button></div>
    </div> : null}
    {batch ? <>
      <div className={styles.batchMeta}>
        <span>ไฟล์: {batch.filename} · ปีในต้นทาง: {batch.yearConvention === "BE" ? "พ.ศ." : "ค.ศ."} · ชุดนำเข้า: <code>{batch.id}</code> · รุ่น {batch.revision}</span>
        <span>เก็บหมายเลขชุดนำเข้านี้ไว้เพื่อเปิดตรวจต่อภายหลัง · ลายนิ้วมือไฟล์: <code>{batch.sourceHash}</code></span>
      </div>
      {stale ? <div className={styles.notice} role="alert"><p>หยุดบันทึกชั่วคราวเนื่องจากมีข้อมูลรุ่นใหม่ โหลดชุดนำเข้าอีกครั้งแล้วตรวจผลของแถวก่อนนำเข้า การแก้ไขที่ยังไม่บันทึกในหน้านี้จะถูกแทนด้วยข้อมูลจากเซิร์ฟเวอร์</p><button type="button" className="secondary-button" disabled={busy !== null} onClick={() => void loadBatch(batch.id)}>โหลดสถานะล่าสุด</button></div> : null}
      <div className={styles.summary} aria-label="สรุปผลตรวจแถวนำเข้า">
        <span>ทั้งหมด<strong>{rows.length}</strong></span><span>นำเข้าแล้ว<strong>{imported}</strong></span><span>ตรวจแล้วและพร้อมนำเข้า<strong>{ready}</strong></span><span>รอตรวจ<strong>{pending}</strong></span><span>รอจับคู่บริษัท<strong>{unmapped}</strong></span><span>มีข้อผิดพลาด<strong>{rejected}</strong></span><span>เลือกข้าม<strong>{skipped}</strong></span>
      </div>
      {hasReceipt && batch.receipt ? <div className={styles.receipt} role="status">
        <strong>ใบรับผลล่าสุดที่เซิร์ฟเวอร์ยืนยัน</strong>
        {!isComplete ? <p>ชุดนี้ยังมีแถวให้ตรวจต่อ แถวที่นำเข้าแล้วจะแก้ได้จากหน้ารายละเอียดกิจกรรม</p> : null}
        {batch.idempotentReplay ? <p>คำขอนี้เป็นการเรียกซ้ำ ระบบส่งใบรับผลเดิมกลับมาโดยไม่สร้างรายการซ้ำ</p> : null}
        <dl>{([
          ["สร้างใหม่", batch.receipt.inserted], ["อัปเดต", batch.receipt.updated], ["ข้อมูลเดิมไม่เปลี่ยน", batch.receipt.unchanged],
          ["ข้าม", batch.receipt.skipped], ["ยังไม่ตรวจ / ไม่ได้นำเข้า", batch.receipt.pending], ["ข้อผิดพลาด / ไม่ได้นำเข้า", batch.receipt.rejected],
        ] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        <p className={styles.caption}>ใบรับผล: {batch.receipt.id} · บันทึกเมื่อ {new Date(batch.receipt.committedAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}</p>
      </div> : <p className={styles.notice}>การอ่านไฟล์ยังไม่สร้างกิจกรรมจริง เปิดแต่ละแถว ตรวจข้อมูล เลือกบริษัท และบันทึกผลตรวจเป็นสร้างใหม่/อัปเดต/ข้าม รายการที่รอตรวจและเลือกข้ามจะไม่นำเข้า แถวที่เลือกสร้างหรืออัปเดตต้องผ่านการตรวจทั้งหมดจึงยืนยันนำเข้าได้</p>}
      <div className={styles.rows}>
        {rows.map(row => <ImportRowReview key={`${reloadEpoch}:${rowKey(row)}`} row={row} companies={companies} companyNames={companyNames}
          disabled={busy !== null || uncertain || stale || isComplete || row.committedActivityId !== null} saving={reviewingRow === row.id} onReview={review} onDirtyChange={markRowDirty} />)}
      </div>
      {!isComplete ? <div className={styles.footer}>
        <p className={styles.caption}>นำเข้าเฉพาะ {ready} แถวที่ตรวจผ่านแล้ว · แถวที่รอตรวจ {pending} · มีข้อผิดพลาด {rejected} · เลือกข้าม {skipped}</p>
        {selectedBlocked > 0 ? <p className={styles.error} role="status">มี {selectedBlocked} แถวที่เลือกสร้าง/อัปเดตแต่ยังไม่ผ่านการตรวจ กรุณาแก้ไขหรือเลือกข้ามแถวนั้นก่อนยืนยัน</p> : null}
        <div className={styles.actions}><button className="primary-button" type="button" disabled={busy !== null || (!canCommit && !uncertain)} onClick={() => void commit()}>
          {busy === "commit" ? "กำลังบันทึก…" : uncertain ? "ลองคำขอเดิมอีกครั้ง" : ready > 0 ? `ยืนยันนำเข้า ${ready} แถวที่ตรวจผ่าน` : `ยืนยันข้าม ${skipped} แถว`}
        </button></div>
      </div> : null}
    </> : null}
  </section>;
}
