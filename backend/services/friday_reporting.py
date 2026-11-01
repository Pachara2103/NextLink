"""Snapshot-consistent reporting over existing Friday data, without writes.

The reviewed October workbook intake stored anonymous score totals/histograms
in versioned notes. Only that explicit, validated format is decoded. Ordinary
notes are never guessed into scores. Provenance, provisional mappings, malformed
reports and duplicate sources remain visible, and only eligible reports count.
"""
from collections import Counter
import math
import re

from core.db import nl_db
from core.exceptions import AppException
from schemas.friday_reporting import FridayAnalytics, FridayEvaluations
from services.friday_activity import _execute, _rows, activity_filter, activity_summary

_FROM = " FROM friday_activities a JOIN academic_periods p ON p.id=a.period_id"
_SUMMARY_KEYS = ("total", "completed", "companies", "attended", "unknown_attendance")
_STUDENT = "ผลประเมินนิสิตระดับกิจกรรม (ไม่เก็บชื่อหรือรหัสนิสิต)"
_COMPANY = "ผลประเมินฝั่งบริษัท:"
_REPORTED = "นำเข้าจากข้อมูลจริงสำหรับทดสอบระบบ"
_PENDING = "ผลประเมิน Friday รอจับคู่กิจกรรม:"
_DIMENSIONS = (
    ("content", "เนื้อหาและประโยชน์ที่ได้รับ"),
    ("speaker", "การถ่ายทอดของวิทยากร"),
    ("application", "ความรู้และทักษะที่นำไปใช้ได้"),
    ("overall", "ความพึงพอใจโดยรวม"),
)
_FILES = {
    "student": "ประเมินฝั่งนิสิต.xlsx",
    "company": "ประเมินฝั่งบริษัท.xlsx",
    "reported": "ตารางกิจกรรม CEDT FridayAct 2566-2569.xlsx",
}
_COMPANY_NAMES = """COALESCE((SELECT json_agg(json_build_object('id',c.id::text,'name',
    COALESCE(NULLIF(btrim(c.company_th),''),NULLIF(btrim(c.company_en),''),'Company '||c.id)) ORDER BY c.id)
    FROM friday_activity_companies ac JOIN companies c ON c.id=ac.company_id
    WHERE ac.activity_id=f.id),'[]'::json)"""


def _summary(values):
    return {key: values[key] for key in _SUMMARY_KEYS}


def analytics(*, academic_year, term, status=None, company_id=None, search=None):
    where, params = activity_filter(academic_year=academic_year, term=term, status=status, company_id=company_id, search=search)
    filtered = "SELECT a.*,p.academic_year,p.term" + _FROM + where
    with nl_db.get_connection() as conn:
        _execute(conn, "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        summary = activity_summary(conn, filtered, params)
        statuses = _rows(conn, f"WITH f AS ({filtered}) SELECT status AS key,count(*) AS count FROM f GROUP BY status ORDER BY status", params)
        formats = _rows(conn, f"WITH f AS ({filtered}) SELECT format AS key,count(*) AS count FROM f WHERE status<>'cancelled' GROUP BY format ORDER BY format", params)
        companies = _rows(conn, f"""WITH f AS ({filtered}) SELECT c.id::text AS id,
            COALESCE(NULLIF(btrim(c.company_th),''),NULLIF(btrim(c.company_en),''),'Company '||c.id) AS name,
            count(*) AS count FROM f JOIN friday_activity_companies ac ON ac.activity_id=f.id
            JOIN companies c ON c.id=ac.company_id WHERE f.status<>'cancelled'
            AND EXISTS(SELECT 1 FROM friday_sessions s WHERE s.activity_id=f.id AND s.status='held')
            GROUP BY c.id ORDER BY count DESC,name,c.id LIMIT 10""", params)
        months = _rows(conn, f"""WITH f AS ({filtered}) SELECT to_char(s.session_date,'YYYY-MM') AS month,
            count(*) FILTER(WHERE s.status='held') AS held,count(*) FILTER(WHERE s.status='planned') AS planned
            FROM f JOIN friday_sessions s ON s.activity_id=f.id WHERE f.status<>'cancelled'
            AND s.status<>'cancelled' AND s.session_date IS NOT NULL GROUP BY month ORDER BY month""", params)
        undated = _rows(conn, f"""WITH f AS ({filtered}) SELECT count(*) AS count FROM f
            JOIN friday_sessions s ON s.activity_id=f.id WHERE f.status<>'cancelled'
            AND s.status<>'cancelled' AND s.session_date IS NULL""", params)[0]["count"]
        # Four comparable academic years, always the same term and same filters.
        # An absent period is null, not an invented zero or a simulated trend.
        trend_where, trend_params = activity_filter(term=term, status=status, company_id=company_id, search=search)
        first_year = max(2000, academic_year - 3)
        trend_filtered = "SELECT a.*,p.academic_year" + _FROM + trend_where + " AND p.academic_year BETWEEN %s AND %s"
        trend_rows = _rows(conn, f"""WITH f AS ({trend_filtered}),
            totals AS (SELECT academic_year,count(*) AS total,count(*) FILTER(WHERE status='completed') AS completed FROM f GROUP BY academic_year),
            partners AS (SELECT f.academic_year,count(DISTINCT ac.company_id) AS companies FROM f
                JOIN friday_activity_companies ac ON ac.activity_id=f.id WHERE f.status<>'cancelled' GROUP BY f.academic_year),
            people AS (SELECT f.academic_year,sum(s.attended) AS attended,
                count(*) FILTER(WHERE s.attended IS NULL) AS unknown_attendance FROM f
                JOIN friday_sessions s ON s.activity_id=f.id WHERE f.status<>'cancelled' AND s.status='held' GROUP BY f.academic_year)
            SELECT p.academic_year,coalesce(t.total,0) AS total,coalesce(t.completed,0) AS completed,
                coalesce(c.companies,0) AS companies,s.attended,coalesce(s.unknown_attendance,0) AS unknown_attendance
            FROM academic_periods p LEFT JOIN totals t USING(academic_year)
            LEFT JOIN partners c USING(academic_year) LEFT JOIN people s USING(academic_year)
            WHERE p.term=%s AND p.academic_year BETWEEN %s AND %s ORDER BY p.academic_year""",
            (*trend_params, first_year, academic_year, term, first_year, academic_year))
        indexed = {row["academic_year"]: row for row in trend_rows}
        trend = [{"academic_year": year, "summary": _summary(indexed[year]) if year in indexed else None}
                 for year in range(first_year, academic_year + 1)]
        result = FridayAnalytics(summary=_summary(summary), status_counts=statuses, format_counts=formats,
            companies=companies, months=months, undated_sessions=undated, trend=trend, last_updated=summary["last_updated"])
        conn.rollback()
        return result


def _dimension(key, label, count=0, total=0, distribution=None):
    counts = distribution or Counter()
    return {"key": key, "label": label, "count": count, "total": total,
            "mean": total / count if count else None,
            "distribution": [{"score": score, "count": counts[score]} for score in range(1, 6)]}


def decode_workbook_note(body, reference, kind):
    """Decode the documented intake format; reject incomplete/inconsistent data."""
    if not re.fullmatch(re.escape(_FILES[kind]) + r" \| [^\n|]+ \| แถว [1-9]\d*(?:-[1-9]\d*)? \| SHA256 [0-9a-f]{64}", reference or ""):
        raise ValueError("แหล่งข้อมูลไม่ตรงรูปแบบนำเข้าที่ตรวจสอบได้")
    if kind == "student":
        if not body.startswith(_STUDENT + "\n"):
            raise ValueError("หัวข้อผลประเมินไม่ตรงรูปแบบ")
        match = re.search(r"(?m)^จำนวนคำตอบ ([1-9]\d*); ไม่รวมแถว Average$", body)
        if not match:
            raise ValueError("ไม่พบจำนวนคำตอบที่ตรวจสอบได้")
        response_count = int(match[1])
        matches = re.findall(r"(?m)^ค่าเฉลี่ย ([0-9]+(?:\.[0-9]+)?)/5; ผลรวม ([0-9]+(?:\.[0-9]+)?); n=([1-9]\d*); การกระจาย ([^\n]+)$", body)
        if len(matches) != 4 or response_count > 2147483647:
            raise ValueError("คะแนนไม่ครบ 4 ด้านหรือจำนวนคำตอบไม่ถูกต้อง")
        dimensions = []
        for (key, label), (mean_text, total_text, count_text, bins) in zip(_DIMENSIONS, matches):
            values = re.fullmatch(r"1 คะแนน=(\d+), 2 คะแนน=(\d+), 3 คะแนน=(\d+), 4 คะแนน=(\d+), 5 คะแนน=(\d+)", bins)
            if values is None:
                raise ValueError("การกระจายคะแนนไม่ครบ 1–5")
            distribution = {score: int(values[score]) for score in range(1, 6)}
            count, total, mean = int(count_text), float(total_text), float(mean_text)
            if (count != response_count or sum(distribution.values()) != count
                or not math.isfinite(total) or not math.isfinite(mean)
                or sum(score * n for score, n in distribution.items()) != total
                or not 1 <= mean <= 5 or abs(mean - total / count) > 0.000051):
                raise ValueError("จำนวนคำตอบ ผลรวม ค่าเฉลี่ย และการกระจายคะแนนไม่สอดคล้องกัน")
            dimensions.append(_dimension(key, label, count, total, distribution))
        return {"response_count": response_count, "dimensions": dimensions}
    if kind == "company":
        marker = "ข้อความต้นฉบับ ไม่มีคะแนนตัวเลข\n"
        if not body.startswith(_COMPANY) or marker not in body:
            raise ValueError("รูปแบบความคิดเห็นบริษัทไม่ครบ")
        return {"feedback": body.split(marker, 1)[1]}
    matches = re.findall(r"(?m)^คะแนนประเมินที่รายงานในตาราง: ([0-9]+(?:\.[0-9]+)?) \(แยกจากคะแนนคำนวณจากไฟล์ประเมินนิสิต\)$", body)
    if not body.startswith(_REPORTED + "\n") or len(matches) != 1 or not 1 <= float(matches[0]) <= 5:
        raise ValueError("คะแนนรายงานในตารางไม่ถูกต้อง")
    return {"reported_score": float(matches[0])}


def evaluations(*, academic_year, term, status=None, company_id=None, search=None, page=1, page_size=20, include_provisional=False, kind=None):
    where, params = activity_filter(academic_year=academic_year, term=term, status=status, company_id=company_id, search=search)
    filtered = "SELECT a.*,p.academic_year,p.term" + _FROM + where
    prefixes = [_STUDENT + "\n%", _COMPANY + "%", _REPORTED + "\n%คะแนนประเมินที่รายงานในตาราง:%"]
    with nl_db.get_connection() as conn:
        _execute(conn, "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        rows = _rows(conn, f"""WITH f AS ({filtered}), origins AS (
            SELECT reference,count(DISTINCT activity_id) AS activities FROM friday_notes
            WHERE body LIKE ANY(%s) GROUP BY reference)
            SELECT n.id::text AS note_id,n.activity_id::text AS activity_id,n.body,n.reference,n.updated_at,
                f.title,f.status AS activity_status,{_COMPANY_NAMES} AS companies,o.activities AS mappings
            FROM friday_notes n JOIN f ON f.id=n.activity_id LEFT JOIN origins o ON o.reference=n.reference
            WHERE n.body LIKE ANY(%s) ORDER BY n.updated_at DESC,n.id DESC LIMIT 5001""", (*params, prefixes, prefixes))
        if len(rows) > 5000:
            raise AppException(message="มีผลประเมินมากเกินขอบเขตรายงาน กรุณากรองบริษัทหรือกิจกรรมให้แคบลง", status_code=422)
        reports, seen, duplicates = [], set(), 0
        for row in rows:
            body, reference = row["body"], row["reference"] or ""
            report_kind = "student" if body.startswith(_STUDENT) else "company" if body.startswith(_COMPANY) else "reported"
            identity = (report_kind, reference)
            if reference and identity in seen:
                duplicates += 1
                continue
            seen.add(identity)
            mapping = "provisional" if "การจับคู่ชั่วคราวสำหรับทดสอบ:" in body else "confirmed"
            if row["mappings"] and row["mappings"] > 1:
                mapping = "conflict"
            report = {key: row[key] for key in ("note_id", "activity_id", "title", "companies", "updated_at")}
            report.update(id="friday-note-" + row["note_id"], kind=report_kind, mapping=mapping, counted=False, reference=reference)
            try:
                report.update(decode_workbook_note(body, reference, report_kind))
            except ValueError as error:
                report.update(mapping="invalid", excluded_reason=str(error))
            if report["mapping"] == "conflict":
                report["excluded_reason"] = "แหล่งข้อมูลเดียวกันผูกหลายกิจกรรม ต้องตรวจการจับคู่"
            elif report["mapping"] == "provisional" and not include_provisional:
                report["excluded_reason"] = "จับคู่ชั่วคราวสำหรับทดสอบ ยังไม่รวมในสถิติ"
            elif report["mapping"] != "invalid" and row["activity_status"] != "completed":
                report["excluded_reason"] = "กิจกรรมยังไม่เสร็จสิ้นหรือถูกยกเลิก ยังไม่รวมในสถิติ"
            elif report["mapping"] in {"confirmed", "provisional"}:
                report["counted"] = True
            reports.append(report)
        # These CRM notes deliberately have no activity link. Never guess one or
        # let them affect the selected activity's satisfaction / response totals.
        pending_clauses = ["n.type='friday'", "n.content LIKE %s", "n.academic_year=%s", "n.semester=%s"]
        pending_params = [_PENDING + "%", academic_year, {"FIRST": 1, "SECOND": 2, "SUMMER": 3}[term]]
        if company_id:
            pending_clauses.append("n.company_id=%s")
            pending_params.append(company_id)
        if search:
            pending_clauses.append("n.content ILIKE %s")
            pending_params.append("%" + search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%")
        pending = _rows(conn, """SELECT n.id::text AS note_id,n.company_id::text AS company_id,n.content,n.updated_at,
            COALESCE(NULLIF(btrim(c.company_th),''),NULLIF(btrim(c.company_en),''),'Company '||c.id) AS name
            FROM notes n LEFT JOIN companies c ON c.id=n.company_id WHERE """ + " AND ".join(pending_clauses) + " ORDER BY n.updated_at DESC,n.id DESC LIMIT 5001", pending_params)
        if len(pending) + len(rows) > 5000:
            raise AppException(message="กรุณากรองบริษัทหรือกิจกรรมให้แคบลงก่อนอ่านผลประเมิน", status_code=422)
        for row in pending:
            source = row["content"].rsplit("\nแหล่งข้อมูล: ", 1)
            reports.append({"id": "company-note-" + row["note_id"], "note_id": row["note_id"], "activity_id": None,
                "title": "ความคิดเห็นบริษัทรอจับคู่กิจกรรม", "companies": [{"id": row["company_id"], "name": row["name"]}] if row["company_id"] else [],
                "kind": "unmatched", "mapping": "unmatched", "counted": False,
                "excluded_reason": "วันที่หรือหัวข้อยังไม่ตรงกิจกรรม ยังไม่รวมในสถิติ", "reference": source[1] if len(source) == 2 else "",
                "feedback": source[0], "updated_at": row["updated_at"]})
        counted = [report for report in reports if report["counted"]]
        students = [report for report in counted if report["kind"] == "student"]
        companies = [report for report in counted if report["kind"] == "company"]
        dimensions = []
        for index, (key, label) in enumerate(_DIMENSIONS):
            parts = [report["dimensions"][index] for report in students]
            distribution = Counter()
            for part in parts:
                distribution.update({item["score"]: item["count"] for item in part["distribution"]})
            dimensions.append(_dimension(key, label, sum(p["count"] for p in parts), sum(p["total"] for p in parts), distribution))
        summary = {"student_responses": sum(report["response_count"] for report in students),
            "student_activities": len({report["activity_id"] for report in students}),
            "company_responses": len(companies), "company_activities": len({report["activity_id"] for report in companies}),
            "provisional_reports": sum(report["mapping"] == "provisional" for report in reports),
            "invalid_reports": sum(report["mapping"] in {"invalid", "conflict"} for report in reports),
            "duplicate_reports": duplicates, "unmatched_reports": len(pending), "dimensions": dimensions}
        selected = [report for report in reports if not kind or report["kind"] == kind]
        result = FridayEvaluations(summary=summary, items=selected[(page - 1) * page_size:page * page_size], total=len(selected),
            page=page, page_size=page_size, include_provisional=include_provisional,
            last_updated=max((report["updated_at"] for report in reports), default=None))
        conn.rollback()
        return result
