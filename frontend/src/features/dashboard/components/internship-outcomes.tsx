"use client";

import { useMemo, useState } from 'react';
import { openingKey, type InternshipScope } from '../lib/internship-history';
import { applyOutcomeDraft, OUTCOME_STAGES, outcomeCount, outcomeStageSummary, outcomeStorageKey, outcomeValidator, selectOutcomes, toOutcomeDraft, type OutcomeDraft } from '../lib/internship-outcomes';
import type { InternshipCompany, InternshipOutcome, InternshipTrack } from '../lib/types';
import { useLocalDataset } from '../lib/use-local-dataset';
import { useRecordEditor } from '../lib/use-record-editor';
import { StorageWarning } from './local-data-status';
import { StorageRecoveryPanel } from './storage-recovery';

const statusText = (value: boolean | null) => value === null ? 'ยังไม่ทราบ' : value ? 'ใช่' : 'ไม่ใช่';
const EMPTY_OUTCOMES: InternshipOutcome[] = [];

function OutcomeEditor({ record, onSave, onClose }: { record: InternshipOutcome; onSave: (id: string, draft: OutcomeDraft) => Promise<boolean>; onClose: () => void }) {
  const editor = useRecordEditor({ record, toDraft: toOutcomeDraft, onSave, onClose });
  return <article className="insight-card outcome-editor" aria-label="บันทึกผลรายนิสิต">
    <h4>{record.studentRef ?? 'ยังไม่มีรหัสอ้างอิงนิสิต'} · รอบ {record.round}</h4>
    <p className="panel-caption">แก้เฉพาะสถานะที่ยืนยันได้ แต่ละขั้นบันทึกแยกกัน รหัสอ้างอิงและบริษัทคงเดิม</p>
    {editor.isEditing && editor.draft ? <form onSubmit={editor.saveEditing}>
      <div className="insight-form-grid">{OUTCOME_STAGES.map(stage => <label key={stage.key}><span>{stage.label}</span><select aria-label={stage.label} value={String(editor.draft![stage.key])} onChange={e => editor.updateDraft(stage.key, e.target.value === 'null' ? null : e.target.value === 'true')}><option value="null">ยังไม่ทราบ</option><option value="true">ใช่</option><option value="false">ไม่ใช่</option></select></label>)}</div>
      <label><span>หมายเหตุผลรายนิสิต</span><textarea maxLength={20000} value={editor.draft.note} onChange={e => editor.updateDraft('note', e.target.value)} /></label>
      <div className="insight-actions"><button className="primary-button" type="submit" disabled={editor.saving}>บันทึกผลรายนิสิต</button><button className="text-button" type="button" disabled={editor.saving} onClick={editor.requestClose}>ยกเลิก</button></div>
    </form> : <><p>{OUTCOME_STAGES.map(stage => stage.label + ': ' + statusText(record[stage.key])).join(' · ')}</p><p>{record.note}</p><div className="insight-actions"><button className="secondary-button" type="button" onClick={editor.startEditing}>แก้ไขสถานะ</button><button className="text-button" type="button" onClick={onClose}>ปิดผลรายนิสิต</button></div></>}
    {editor.saveError && <p role="alert">{editor.saveError}</p>}{editor.saveMessage && <p role="status">{editor.saveMessage}</p>}
  </article>;
}

export function InternshipOutcomes({ seed = EMPTY_OUTCOMES, allCompanies, companies, scope, track }: { seed?: InternshipOutcome[]; allCompanies: InternshipCompany[]; companies: InternshipCompany[]; scope: InternshipScope; track: InternshipTrack }) {
  const validate = useMemo(() => outcomeValidator(allCompanies), [allCompanies]);
  const dataset = useLocalDataset(outcomeStorageKey(track), seed, validate);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState('');
  const rows = selectOutcomes(dataset.items, scope, new Set(companies.map(c => c.id)));
  const selected = dataset.items.find(r => r.id === selectedId);
  const readable = dataset.ready && !dataset.warning;
  const save = (id: string, draft: OutcomeDraft) => dataset.update(current => current.map(row => row.id === id ? applyOutcomeDraft(row, draft) : row));
  const reset = async () => {
    if (window.confirm('คืนค่าผลรายนิสิตในปีและเทอมนี้เป็นข้อมูลตัวอย่างหรือไม่?')) setResetMessage(await dataset.reset() ? 'คืนค่าผลรายนิสิตแล้ว' : 'คืนค่าไม่ได้ ข้อมูลเดิมยังอยู่');
  };
  return <section className="panel insight-panel" id="internship-outcomes" aria-labelledby="outcomes-title" data-ready={readable}>
    <div className="panel-heading"><div><p className="section-kicker">ติดตามผลรายนิสิต</p><h3 id="outcomes-title">ผลจับคู่ การตอบรับ และการเข้าฝึกจริง</h3></div>{dataset.hasOverrides && !selected && <button type="button" className="text-button" onClick={reset}>คืนค่าผลรายนิสิต</button>}</div>
    <p className="panel-caption">ตามปี เทอม บริษัท ชั้นปี และรอบที่กรอง · สถานะจำลองสำหรับตรวจหน้าจอ แยกจากอันดับสมัครและยอดรับตามทะเบียน</p>
    <StorageWarning message={dataset.warning} /><StorageRecoveryPanel key={dataset.recovery?.raw} recovery={dataset.recovery} onRecover={dataset.recover} />
    <div className="insight-card-grid">{OUTCOME_STAGES.map(stage => {
      const summary = outcomeStageSummary(rows, stage.key);
      return <article className="insight-card" key={stage.key} data-stage={stage.key}><h4>{stage.label}</h4><strong>{readable ? outcomeCount(summary) : 'กำลังตรวจข้อมูล'}</strong><small>คนไม่ซ้ำจาก {summary.records} รายการผล</small>{readable && (summary.unknown > 0 || summary.unidentified > 0) && <small>ยังไม่ทราบสถานะ {summary.unknown} รายการ · ไม่ทราบรหัสนิสิต {summary.unidentified} รายการ</small>}</article>;
    })}</div>
    <p className="panel-caption">คนเดิมข้ามรอบนับครั้งเดียวในแต่ละขั้น แต่ละขั้นอาจมีคนซ้ำกันจึงนำยอดมาบวกกันไม่ได้ · ≥ คือจำนวนที่ยืนยันได้อย่างน้อย · ตำแหน่งที่ไม่มีผลบันทึกยังสรุปว่าไม่มีคนเข้าฝึกไม่ได้</p>
    {readable && <details className="outcome-breakdown"><summary>ดูบริษัทและตำแหน่งที่เข้าฝึก ({companies.length} บริษัท)</summary>
      <div className="insight-card-grid">{companies.map(company => <article className="insight-card" key={company.id}><h4>{company.shortName}</h4>{company.positions.map((position, index) => {
        const openingId = position.id ?? openingKey(company.id, index), results = rows.filter(r => r.companyId === company.id && r.openingId === openingId);
        return <div className="outcome-position" key={openingId}><strong>{position.name}</strong><small>แจ้งรับ {position.declaredIntake} ที่นั่ง</small>{OUTCOME_STAGES.map(stage => <small key={stage.key}>{stage.label}: {outcomeCount(outcomeStageSummary(results, stage.key))}</small>)}</div>;
      })}</article>)}</div>
    </details>}
    {readable && <details className="outcome-breakdown"><summary>ตรวจผลรายนิสิต ({rows.length} รายการ)</summary>
      <div className="insight-card-grid">{rows.map(row => { const company = allCompanies.find(c => c.id === row.companyId); return <article className="insight-card" key={row.id}><h4>{row.studentRef ?? 'ยังไม่มีรหัสอ้างอิงนิสิต'}</h4><small>{company?.shortName} · {company?.positions.find((p, i) => (p.id ?? openingKey(company.id, i)) === row.openingId)?.name}</small><small>ปี {row.studyYear ?? 'ไม่ทราบ'} · รอบ {row.round}</small>{OUTCOME_STAGES.map(stage => <small key={stage.key}>{stage.label}: {statusText(row[stage.key])}</small>)}<button type="button" className="secondary-button" disabled={Boolean(selected)} onClick={() => setSelectedId(row.id)} aria-label={'ตรวจผล ' + row.id}>ตรวจและแก้ไขผล</button></article>; })}</div>
      {!rows.length && <p className="empty-state">ยังไม่มีผลรายนิสิตในขอบเขตนี้</p>}
    </details>}
    {selected && <OutcomeEditor key={selected.id} record={selected} onSave={save} onClose={() => setSelectedId(null)} />}
    {resetMessage && <p role="status">{resetMessage}</p>}
  </section>;
}
