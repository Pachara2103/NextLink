import { fridayScore, studentRatingSummary, type FridayActivity } from "../lib/friday-activity";

export function FridayStudentRatings({ activities }: { activities: FridayActivity[] }) {
  return <div className="friday-ratings" aria-label="คะแนนประเมินนิสิต 4 ด้าน">
    {studentRatingSummary(activities).map(rating => <div className="friday-rating" key={rating.key}>
      <div className="friday-rating-label"><span>{rating.label}</span><strong>{fridayScore(rating.mean)}{rating.mean !== null ? " / 5" : ""}</strong></div>
      <div className="friday-rating-track" aria-hidden="true"><span style={{ width: `${rating.mean === null ? 0 : rating.mean / 5 * 100}%` }} /></div>
      <small>{rating.count} คำตอบที่มีคะแนน</small>
    </div>)}
  </div>;
}

export function FridayCompanyFeedback({ activity }: { activity: FridayActivity }) {
  return <div className="friday-feedback-list">{activity.companyEvaluations.length ? activity.companyEvaluations.map((response, index) => <div className="friday-feedback" key={response.id}>
    <strong>คำตอบบริษัทที่ {index + 1}</strong><small>วันที่ตอบ: {response.submittedAt ? new Date(response.submittedAt).toLocaleDateString("th-TH") : "ยังไม่มีข้อมูล"}</small>
    <dl>
      <dt>กิจกรรมวันนี้เป็นอย่างไร</dt><dd>{response.experience || "ไม่ได้ตอบ"}</dd>
      <dt>หัวข้อที่อยากมาแบ่งปันเพิ่มเติม</dt><dd>{response.suggestedTopic || "ไม่ได้ตอบ"}</dd>
      <dt>สิ่งที่อยากให้หลักสูตรพัฒนา</dt><dd>{response.improvement || "ไม่ได้ตอบ"}</dd>
    </dl>
  </div>) : <p className="panel-caption">ยังไม่มีผลประเมินจากบริษัท</p>}</div>;
}
