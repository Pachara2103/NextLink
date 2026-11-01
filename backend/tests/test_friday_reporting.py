"""Reporting invariants over real PostgreSQL, including historical intake notes."""
from uuid import uuid4

import pytest

from test_friday_core import create, execute, friday_client, payload, sign_in, transition

BASE = "/api/v1/friday-activities"
PERIOD = {"academicYear": 2026, "term": "FIRST"}
FILES = {"student": "ประเมินฝั่งนิสิต.xlsx", "company": "ประเมินฝั่งบริษัท.xlsx", "reported": "ตารางกิจกรรม CEDT FridayAct 2566-2569.xlsx"}


def reference(kind="student", identity=None):
    return f"{FILES[kind]} | QA {identity or uuid4()} | แถว 2-9 | SHA256 {'a' * 64}"


def student_body(count, score, *, provisional=False):
    lines = ["ผลประเมินนิสิตระดับกิจกรรม (ไม่เก็บชื่อหรือรหัสนิสิต)", f"จำนวนคำตอบ {count}; ไม่รวมแถว Average"]
    if provisional:
        lines.append("การจับคู่ชั่วคราวสำหรับทดสอบ: ต้องยืนยันวันที่จริงก่อนใช้รายงาน")
    for label in ["เนื้อหา", "วิทยากร", "การนำไปใช้", "ภาพรวม"]:
        lines.extend([label, f"ค่าเฉลี่ย {score:.4f}/5; ผลรวม {count * score:g}; n={count}; การกระจาย " + ", ".join(f"{value} คะแนน={count if value == score else 0}" for value in range(1, 6))])
    return "\n".join(lines)


def company_body(text="ข้อเสนอแนะสังเคราะห์สำหรับทดสอบ"):
    return "ผลประเมินฝั่งบริษัท: QA\nวันที่กิจกรรมตามคำตอบ: 2026-09-04\nประทับเวลาต้นทาง: 2026-09-04\nข้อความต้นฉบับ ไม่มีคะแนนตัวเลข\nประสบการณ์\n" + text + "\nหัวข้อที่สนใจ\nWorkshop\nสิ่งที่ควรปรับปรุง\nเพิ่มเวลา"


def note(activity, body, source):
    return execute("""INSERT INTO friday_notes(activity_id,kind,body,reference,author_user_id,updated_by_user_id)
        VALUES(%s,'fact',%s,%s,1,1) RETURNING id""", (activity["id"], body, source), fetch=True)[0][0]


def completed(client, headers, **changes):
    session = payload()["sessions"][0]
    activity = create(client, headers, sessions=[{**session, "status": "held", "attended": 0}], **changes)
    for status in ("confirmed", "in_progress", "completed"):
        activity = transition(client, headers, activity, status)
    return activity


def report(client, headers, name="analytics", **params):
    response = client.get(f"{BASE}/{name}", headers=headers, params={**PERIOD, **params})
    assert response.status_code == 200, response.text
    return response.json()


def test_analytics_covers_all_pages_without_company_session_fanout(friday_client):
    client = friday_client
    headers = sign_in(client)
    activity = completed(client, headers, companyIds=["1", "2"])
    execute("UPDATE friday_sessions SET attended=7 WHERE activity_id=%s", (activity["id"],))
    execute("""INSERT INTO friday_sessions(activity_id,session_date,status,attended)
        VALUES(%s,'2026-10-16','held',NULL),(%s,'2026-10-16','held',0),(%s,NULL,'planned',NULL)""", (activity["id"],) * 3)
    cancelled = create(client, headers, sessions=[{**payload()["sessions"][0], "status": "held", "attended": 9999}])
    transition(client, headers, cancelled, "cancelled", "QA cancelled")
    for index in range(30):
        create(client, headers, title=f"Plan {index}", sessions=[])
    data = report(client, headers)
    listed = client.get(BASE, headers=headers, params=PERIOD).json()
    assert len(listed["items"]) == 25 and data["summary"] == listed["summary"]
    assert data["summary"] == {"total": 32, "completed": 1, "companies": 2, "attended": 7, "unknownAttendance": 1}
    assert sum(item["count"] for item in data["statusCounts"]) == 32
    assert sum(item["count"] for item in data["formatCounts"]) == 31
    assert sorted((item["id"], item["count"]) for item in data["companies"]) == [("1", 1), ("2", 1)]
    assert data["months"] == [{"month": "2026-10", "held": 3, "planned": 0}]
    assert data["undatedSessions"] == 1


def test_history_uses_same_term_keeps_missing_years_and_known_zero(friday_client):
    headers = sign_in(friday_client)
    completed(friday_client, headers, academicYear=2025)
    completed(friday_client, headers, academicYear=2025, term="SECOND")
    create(friday_client, headers)
    data = report(friday_client, headers)
    assert [item["academicYear"] for item in data["trend"]] == [2023, 2024, 2025, 2026]
    assert data["trend"][0]["summary"] is None and data["trend"][1]["summary"] is None
    assert data["trend"][2]["summary"]["total"] == 1
    assert data["trend"][2]["summary"]["attended"] == 0
    assert data["trend"][3]["summary"]["attended"] is None


def test_anonymous_evaluations_are_weighted_and_reported_scores_stay_separate(friday_client):
    headers = sign_in(friday_client)
    one = completed(friday_client, headers, title="Small sample")
    four = completed(friday_client, headers, title="Larger sample")
    note(one, student_body(1, 1), reference())
    note(four, student_body(4, 5), reference())
    note(one, company_body(), reference("company"))
    note(one, "นำเข้าจากข้อมูลจริงสำหรับทดสอบระบบ\nคะแนนประเมินที่รายงานในตาราง: 5 (แยกจากคะแนนคำนวณจากไฟล์ประเมินนิสิต)", reference("reported"))
    data = report(friday_client, headers, "evaluations", pageSize=2)
    assert data["summary"]["studentResponses"] == 5
    assert data["summary"]["studentActivities"] == 2
    assert data["summary"]["companyResponses"] == 1
    assert data["summary"]["dimensions"][3]["mean"] == 4.2
    assert data["summary"]["dimensions"][3]["distribution"] == [{"score": value, "count": {1: 1, 5: 4}.get(value, 0)} for value in range(1, 6)]
    assert data["total"] == 4 and len(data["items"]) == 2
    second = report(friday_client, headers, "evaluations", page=2, pageSize=2)
    assert not {item["id"] for item in data["items"]} & {item["id"] for item in second["items"]}
    assert second["summary"] == data["summary"]
    reported = report(friday_client, headers, "evaluations", kind="reported")
    assert reported["items"][0]["reportedScore"] == 5
    assert reported["summary"]["dimensions"][3]["mean"] == 4.2
    assert all("studentId" not in item and "studentName" not in item for item in data["items"])


def test_provisional_and_incomplete_reports_do_not_silently_enter_statistics(friday_client):
    headers = sign_in(friday_client)
    activity = completed(friday_client, headers)
    note(activity, student_body(20, 5, provisional=True), reference())
    note(activity, student_body(3, 4).replace("ผลรวม 12", "ผลรวม 15"), reference())
    note(activity, student_body(2, 4), "unverified provenance")
    note(activity, "ordinary note mentioning ค่าเฉลี่ย 5/5", reference())
    data = report(friday_client, headers, "evaluations")
    assert data["total"] == 3
    assert data["summary"]["studentResponses"] == 0
    assert data["summary"]["dimensions"][0]["mean"] is None
    assert data["summary"]["provisionalReports"] == 1 and data["summary"]["invalidReports"] == 2
    assert not any(item["counted"] for item in data["items"])
    included = report(friday_client, headers, "evaluations", includeProvisional=True)
    assert included["summary"]["studentResponses"] == 20
    assert included["summary"]["dimensions"][0]["mean"] == 5


def test_exact_source_duplicates_and_cross_period_mapping_conflicts_are_excluded(friday_client):
    headers = sign_in(friday_client)
    activity = completed(friday_client, headers)
    source = reference()
    note(activity, student_body(10, 4), source)
    note(activity, student_body(10, 4), source)
    data = report(friday_client, headers, "evaluations")
    assert data["summary"]["studentResponses"] == 10 and data["summary"]["duplicateReports"] == 1
    other = completed(friday_client, headers, academicYear=2025)
    note(other, student_body(10, 4), source)
    data = report(friday_client, headers, "evaluations", includeProvisional=True)
    assert data["summary"]["studentResponses"] == 0
    assert data["items"][0]["mapping"] == "conflict"


def test_cancelled_or_unfinished_activity_feedback_never_counts(friday_client):
    headers = sign_in(friday_client)
    activity = create(friday_client, headers)
    note(activity, student_body(3, 4), reference())
    note(activity, company_body(), reference("company"))
    for status in ("draft", "cancelled"):
        if status == "cancelled":
            transition(friday_client, headers, activity, status, "QA cancelled")
        data = report(friday_client, headers, "evaluations")
        assert data["summary"]["studentResponses"] == 0 and data["summary"]["companyResponses"] == 0
        assert all(not item["counted"] for item in data["items"])


def test_unmatched_company_note_is_visible_in_its_period_without_guessing_activity(friday_client):
    headers = sign_in(friday_client)
    source = reference("company")
    execute("""INSERT INTO notes(company_id,content,type,sentiment,source,academic_year,semester)
        VALUES(1,%s,'friday','neutral','external',2026,1)""",
        ("ผลประเมิน Friday รอจับคู่กิจกรรม: วันที่/หัวข้อยังไม่ตรงตาราง\n" + company_body() + "\nแหล่งข้อมูล: " + source,))
    data = report(friday_client, headers, "evaluations")
    assert data["total"] == 1 and data["summary"]["unmatchedReports"] == 1
    assert data["summary"]["companyResponses"] == 0
    assert data["items"][0]["activityId"] is None and data["items"][0]["reference"] == source
    assert report(friday_client, headers, "evaluations", companyId="2")["total"] == 0
    assert report(friday_client, headers, "evaluations", academicYear=2025)["total"] == 0


def test_reports_share_registry_filters_and_escape_literal_wildcards(friday_client):
    headers = sign_in(friday_client)
    activity = completed(friday_client, headers, title="Needle 100%_ literal")
    completed(friday_client, headers, title="Needle 100AA literal", companyIds=["2"], people=[])
    note(activity, student_body(2, 4), reference())
    data = report(friday_client, headers, search="100%_")
    assert data["summary"]["total"] == 1
    assert report(friday_client, headers, "evaluations", search="100%_")["summary"]["studentResponses"] == 2
    assert report(friday_client, headers, companyId="2")["summary"]["total"] == 1
    assert report(friday_client, headers, "evaluations", companyId="2")["summary"]["studentResponses"] == 0


@pytest.mark.parametrize("endpoint", ["analytics", "evaluations"])
def test_reports_require_active_authorized_session_and_validate_inputs(friday_client, endpoint):
    headers = sign_in(friday_client)
    assert friday_client.get(f"{BASE}/{endpoint}", params=PERIOD).status_code == 401
    assert friday_client.get(f"{BASE}/{endpoint}", headers=headers, params={**PERIOD, "companyId": "9999999999999999999"}).status_code == 400
    assert friday_client.get(f"{BASE}/{endpoint}", headers=headers, params={**PERIOD, "academicYear": 1900}).status_code == 422
    execute("UPDATE users SET role=NULL WHERE id=1")
    assert friday_client.get(f"{BASE}/{endpoint}", headers=headers, params=PERIOD).status_code == 403
    execute("UPDATE users SET is_active=false WHERE id=1")
    assert friday_client.get(f"{BASE}/{endpoint}", headers=headers, params=PERIOD).status_code == 401
