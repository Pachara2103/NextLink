"use client";

import type { CapstoneDataset, CapstoneTopic, CompanyRanking } from "@/features/dashboard/lib/capstone-types";
import { moveRank, rankingRows } from "@/features/dashboard/lib/capstone-ranking";
import { formatUpdated } from "@/features/dashboard/lib/format";

export function CapstoneRanking({ topic, data, round, onRoundChange, onChange }: {
  topic: CapstoneTopic; data: CapstoneDataset; round: string; onRoundChange: (round: string) => void;
  onChange?: (ranking: CompanyRanking) => void;
}) {
  const ranking = topic.rankings.find(r => r.round === round) ?? { round, applicationIds: [], note: "", recordedBy: "", updatedAt: null };
  const rows = rankingRows(topic, round);
  const company = data.companies.find(c => c.id === topic.companyId);
  function change(order: string[]) {
    onChange?.({ ...ranking, applicationIds: order, updatedAt: new Date().toISOString(), recordedBy: "ผู้บันทึก Demo" });
  }
  return <div className="cap-ranking">
    <div className="cap-section-heading">
      <div><strong>{company?.name ?? "ยังไม่มีบริษัทเจ้าของโครงการ"}</strong><p className="panel-caption">บริษัทจัดอันดับเป็นกลุ่ม · ผลตอบรับแสดงแยกในทีมที่ยืนยันแล้ว</p></div>
      <label className="table-sort">รอบจัดอันดับ<select aria-label="รอบจัดอันดับ" value={round} onChange={e => onRoundChange(e.target.value)}>{topic.rounds.map(r => <option key={r} value={r}>รอบ {r}</option>)}</select></label>
    </div>
    {!topic.applicationsKnown ? <p className="empty-state">ยังไม่มีข้อมูลใบสมัคร</p> : rows.length === 0 ? <p className="empty-state">ยังไม่มีกลุ่มสมัครในรอบนี้</p> : <ol className="cap-rank-list" aria-label={`อันดับกลุ่มจากบริษัท รอบ ${round}`}>
      {rows.map(({ application, rank }) => {
        const team = data.teams.find(t => t.id === application.teamId)!;
        return <li key={application.id} className="cap-rank-row" data-application-id={application.id}>
          <span className={`cap-rank-number ${rank === 1 ? "tone-green" : "tone-neutral"}`} aria-label={rank === null ? "ยังไม่ได้จัดอันดับ" : `อันดับ ${rank}`}>{rank ?? "—"}</span>
          <div className="cap-rank-copy"><strong>{team.name}</strong><small>{team.studentIds.map(id => data.students.find(s => s.id === id)?.name ?? id).join(" · ")}</small>{rank === null && <span className="panel-caption">ยังไม่ได้จัดอันดับ</span>}</div>
          {onChange && company && <div className="cap-rank-actions">{rank === null ? <button className="row-action" type="button" onClick={() => change([...ranking.applicationIds, application.id])} aria-label={`เพิ่ม ${team.name} ในอันดับ`}>เพิ่มในอันดับ</button> : <>
            <button className="row-action" type="button" disabled={rank === 1} aria-label={`เลื่อน ${team.name} ขึ้น`} onClick={() => change(moveRank(ranking.applicationIds, application.id, -1))}>↑</button>
            <button className="row-action" type="button" disabled={rank === ranking.applicationIds.length} aria-label={`เลื่อน ${team.name} ลง`} onClick={() => change(moveRank(ranking.applicationIds, application.id, 1))}>↓</button>
            <button className="row-action" type="button" aria-label={`นำ ${team.name} ออกจากอันดับ`} onClick={() => change(ranking.applicationIds.filter(id => id !== application.id))}>นำออก</button>
          </>}</div>}
        </li>;
      })}
    </ol>}
    {onChange && company ? <label className="cap-field"><span>หมายเหตุจากบริษัท</span><textarea maxLength={20000} value={ranking.note} onChange={e => onChange({ ...ranking, note: e.target.value, recordedBy: "ผู้บันทึก Demo", updatedAt: new Date().toISOString() })} /></label> : ranking.note && <p className="panel-caption">หมายเหตุ: {ranking.note}</p>}
    {ranking.updatedAt && <p className="source-footnote">บันทึกล่าสุด {formatUpdated(ranking.updatedAt, "Asia/Bangkok")} · {ranking.recordedBy || "ยังไม่ระบุผู้บันทึก"}</p>}
  </div>;
}
