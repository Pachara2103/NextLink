"""นำเข้าข้อมูล MoU จากไฟล์ .xlsx -> companies + mous + employees

หนึ่งแถวในไฟล์ = หนึ่ง transaction
    companies (sync_create_company) -> mous (create_mou_pg) -> employees (sync_create_employee)
พังตรงไหนก็ rollback ทั้งแถว แล้วจด `No` ของแถวนั้นไว้แจ้ง user แล้วไปทำแถวถัดไป
แถวจะถูก commit ก็ต่อเมื่อเขียนครบทั้ง 3 ตารางแล้วเท่านั้น

companies / employees ผ่าน sync_* จึงจองงานเขียนกราฟลง outbox ใน transaction
เดียวกัน ส่วน mous เขียนแค่ postgres - งานเขียนกราฟถูกยิงทีหลังใน
`flush_imported()` (เรียกเป็น background task หลังตอบ request แล้ว)
"""

import io
import logging
import re
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any

import psycopg2
from openpyxl import load_workbook
from openpyxl.utils.datetime import from_excel

from core.db import nl_db
from core.exceptions import AppException, BadRequestError
from schemas.company import CompanyName
from schemas.employee import EmployeeBase
from schemas.enums import ContactStatus, DocumentStatus, RelevantType
from schemas.mou import ImportResult, ImportRowError, MouBase
from services import outbox
from services.company import create_mou_pg, sync_create_company
from services.employee import sync_create_employee

logger = logging.getLogger(__name__)

MAX_FILE_BYTES = 10 * 1024 * 1024

# --------------------------------------------------------------------------- #
# คอลัมน์ในไฟล์ (เทียบหลัง strip - หัวคอลัมน์จริงบางอันมีช่องว่างต่อท้าย)
# 'ชื่อจริง', 'ชื่อเล่น', 'ชื่อจริงอังกฤษ', 'ชื่อเล่นภาษาอังกฤษ' ไม่ได้ใช้
# --------------------------------------------------------------------------- #
COL_NO = "No"
COL_COMPANY = "บริษัท"
COL_COMPANY_NAME = "Company Name"
COL_DOC_STATUS = "สถานะเอกสาร"
COL_EDITED = "แก้ไข"
COL_AUTH_STATUS = "สถานะมอบอำนาจ"
COL_COORDINATOR = "ชื่อผู้ประสานงาน"

#: คอลัมน์ข้อความ -> ฟิลด์ของ mous
TEXT_COLUMNS = {
    "อว. (Template MoU)": "mou_template",
    "คพ.บันทึกขอตรวจแก้ MoU": "company_revision_doc",
    "อว.ผลพิจารณาจากศูนย์กฎหมาย": "legal_review_result",
    "คพ.บันทึกส่งอนุมัติก่อนมอบอำนาจ": "pre_auth_approval_doc",
    "อว.อนุมัติก่อนมอบอำนาจ": "pre_auth_status",
    "คพ.ขอมอบอำนาจ": "power_of_attorney_doc",
}

#: คอลัมน์วันที่ -> ฟิลด์ของ mous
DATE_COLUMNS = {
    "วันที่ บันทึกขอตรวจแก้ MoU": "company_revision_date",
    "วันที่ อว.ผลพิจารณาจากศูนย์กฎหมาย": "legal_review_date",
    "วันที่ บันทึกส่งอนุมัติก่อนมอบอำนาจ": "pre_auth_approval_date",
    "วันที่ อว.อนุมัติก่อนมอบอำนาจ": "pre_auth_status_date",
    "วันที่ บันทึกขอมอบอำนาจ": "power_of_attorney_date",
}

REQUIRED_COLUMNS = [
    COL_NO, COL_COMPANY, COL_COMPANY_NAME, COL_DOC_STATUS, COL_EDITED,
    *TEXT_COLUMNS, *DATE_COLUMNS, COL_AUTH_STATUS, COL_COORDINATOR,
]

# --------------------------------------------------------------------------- #
# ค่าที่ต้อง map
# --------------------------------------------------------------------------- #

#: key ผ่าน _status_key() แล้ว (ตัดช่องว่าง จุด ฯ วงเล็บ)
DOCUMENT_STATUS_MAP: dict[str, DocumentStatus] = {
    "แก้ไขที่นิติกรจุฬา": DocumentStatus.UNDER_REVISION_BY_CHULA_LEGAL_COUNSEL,
    "นิติกรจุฬา": DocumentStatus.UNDER_REVISION_BY_CHULA_LEGAL_COUNSEL,
    "นิติกรบริษัท": DocumentStatus.UNDER_REVIEW_BY_COMPANY_LEGAL_COUNSEL,
    "มอบอำนาจ": DocumentStatus.AUTHORIZATION,
    "รอลงนาม": DocumentStatus.AWAITING_MOU_SIGNING,
    "รอลงนามmou": DocumentStatus.AWAITING_MOU_SIGNING,
    "ลงนามแล้ว": DocumentStatus.SIGNED,
    "ลงนามมหาวิทยาลัย": DocumentStatus.SIGNED_AT_UNIVERSITY_LEVEL,
    "ลงนามกับมหาวิทยาลัย": DocumentStatus.SIGNED_AT_UNIVERSITY_LEVEL,
    "ลงนามแล้วบริษัทในเครือ": DocumentStatus.SIGNED_AFFILIATED_COMPANY,
    "ลงนามแล้วบในเครือ": DocumentStatus.SIGNED_AFFILIATED_COMPANY,
    "ลงนามแล้วในเครือ": DocumentStatus.SIGNED_AFFILIATED_COMPANY,
    "หน่วยงานภายในจุฬา": DocumentStatus.INTERNAL_CHULA_UNIT,
    "หน่วยงานจุฬา": DocumentStatus.INTERNAL_CHULA_UNIT,
    "ปฏิเสธการลงนาม": DocumentStatus.DECLINED_TO_SIGN,
    "ปฏิเสธลงนาม": DocumentStatus.DECLINED_TO_SIGN,
    "ยังไม่ได้ลงนาม": DocumentStatus.NOT_YET_SIGNED,
    "ยังไม่ลงนาม": DocumentStatus.NOT_YET_SIGNED,
}

AUTHORIZED_MAP = {
    "มอบอำนาจแล้ว": True,
    "โดนยกเลิกมอบอำนาจ": False,
    "ยกเลิกมอบอำนาจ": False,
}

EDITED_MAP = {"y": True, "yes": True, "n": False, "no": False}

#: ชื่อเดือนหลังตัดจุด/ช่องว่างแล้ว ทั้งชื่อเต็มและชื่อย่อ (ไทย + อังกฤษ)
MONTHS: dict[str, int] = {}
#: ชื่อเรียกแบบพูด เช่น 'กุมภา', 'ตุลา'
_SPOKEN = ["มกรา", "กุมภา", "มีนา", "เมษา", "พฤษภา", "มิถุนา",
           "กรกฎา", "สิงหา", "กันยา", "ตุลา", "พฤศจิกา", "ธันวา"]
for _num, _names in {
    1: ["มกราคม", "มค", "january", "jan"],
    2: ["กุมภาพันธ์", "กุมภาพันธ", "กพ", "february", "feb"],
    3: ["มีนาคม", "มีค", "march", "mar"],
    4: ["เมษายน", "เมย", "april", "apr"],
    5: ["พฤษภาคม", "พค", "may"],
    6: ["มิถุนายน", "มิย", "june", "jun"],
    7: ["กรกฎาคม", "กรกฏาคม", "กค", "july", "jul"],
    8: ["สิงหาคม", "สค", "august", "aug"],
    9: ["กันยายน", "กย", "september", "sep", "sept"],
    10: ["ตุลาคม", "ตค", "october", "oct"],
    11: ["พฤศจิกายน", "พย", "november", "nov"],
    12: ["ธันวาคม", "ธค", "december", "dec"],
}.items():
    for _name in [*_names, _SPOKEN[_num - 1]]:
        MONTHS[_name] = _num

_THAI = re.compile(r"[฀-๿]")
_COMPANY_PREFIX = re.compile(r"^บริษัท\s*")
_KHUN = re.compile(r"^คุณ\s*")
_SPACES = re.compile(r"\s+")


class RowError(Exception):
    """ข้อมูลในแถวผิด - message คือสิ่งที่ user จะเห็น"""


# --------------------------------------------------------------------------- #
# ตัวแปลงค่า
# --------------------------------------------------------------------------- #

def _text(value: Any) -> str | None:
    """ค่าว่าง / ช่องว่างล้วน / '-' -> None, ตัวเลข 12.0 -> '12'"""
    if value is None:
        return None
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    text = _SPACES.sub(" ", str(value)).strip()
    if text in ("", "-", "–", "nan", "None"):
        return None
    return text


def _is_thai(text: str) -> bool:
    return bool(_THAI.search(text))


def _ad_year(year: int, digits: int) -> int:
    """ปีที่พิมพ์มา -> ค.ศ.

    2 หลัก = พ.ศ. ตัดหน้า (67 -> 2567), 4 หลักเกิน 2400 = พ.ศ., ที่เหลือคือ ค.ศ.
    """
    if digits <= 2:
        return 2500 + year - 543
    if year > 2400:
        return year - 543
    return year


def _from_cell_date(value: datetime | date) -> date:
    """วันที่ที่ excel แปลงให้เอง

    พิมพ์ "12 ก.พ. 67" excel จะเก็บเป็น 12/02/1967 (มองปี 2 หลักเป็น 19xx)
    ปี 19xx จึงคือ พ.ศ. 25xx, ปีเกิน 2400 คือ พ.ศ. เต็ม, ที่เหลือเป็น ค.ศ. แล้ว
    """
    d = value.date() if isinstance(value, datetime) else value
    if d.year < 2000:
        year = _ad_year(d.year % 100, 2)
    elif d.year > 2400:
        year = d.year - 543
    else:
        return d
    try:
        return d.replace(year=year)
    except ValueError as e:  # 29 ก.พ. ที่ปีใหม่ไม่ใช่ปีอธิกสุรทิน
        raise RowError(f"วันที่ไม่ถูกต้อง '{d.day}/{d.month}/{d.year}'") from e


def parse_thai_date(value: Any, column: str) -> date | None:
    """'12 ก.พ. 67', '12 ก..พ. 67', '12 กพ 67', '12 กุมภาพันธ์ 2567' -> date(2024, 2, 12)"""
    if value is None:
        return None
    if isinstance(value, (datetime, date)):
        return _from_cell_date(value)
    if isinstance(value, (int, float)):
        try:
            return _from_cell_date(from_excel(value))
        except (ValueError, OverflowError, TypeError) as e:
            raise RowError(f"วันที่ไม่ถูกต้อง '{value}' ที่คอลัมน์ '{column}'") from e

    raw = _text(value)
    if raw is None:
        return None

    # split ด้วยช่องว่าง แล้วตัดจุดทิ้งทุกส่วน
    parts = [p.replace(".", "") for p in raw.split(" ")]
    parts = [p for p in parts if p]
    joined = " ".join(parts)

    day_text = month_text = year_text = None
    if len(parts) == 3:
        day_text, month_text, year_text = parts
    else:
        # เผื่อพิมพ์ติดกัน '12กพ67' หรือเว้นวรรคขาด/เกิน
        m = re.fullmatch(r"(\d{1,2})\s*([^\d\s]+)\s*(\d{2,4})", joined)
        if m:
            day_text, month_text, year_text = m.groups()
        else:
            # รูปแบบตัวเลขล้วน 12/02/67 หรือ 12-02-2567
            m = re.fullmatch(r"(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})", raw.replace(" ", ""))
            if m:
                day_text, month_text, year_text = m.groups()

    if day_text is None or not day_text.isdigit() or not (year_text or "").isdigit():
        raise RowError(f"รูปแบบวันที่ไม่ถูกต้อง '{raw}' ที่คอลัมน์ '{column}'")

    if month_text.isdigit():
        month = int(month_text)
    else:
        month = MONTHS.get(month_text.lower())
    if not month or not 1 <= month <= 12:
        raise RowError(f"ชื่อเดือนผิด '{month_text}' ('{raw}') ที่คอลัมน์ '{column}'")

    year = _ad_year(int(year_text), len(year_text))
    try:
        return date(year, month, int(day_text))
    except ValueError as e:
        raise RowError(f"วันที่ไม่ถูกต้อง '{raw}' ที่คอลัมน์ '{column}'") from e


def _status_key(text: str) -> str:
    return re.sub(r"[\s.ฯ()（）]", "", text).lower()


def parse_document_status(value: Any) -> DocumentStatus:
    raw = _text(value)
    if raw is None:
        # mous.document_status เป็น NOT NULL - ว่างไม่ได้
        raise RowError("ไม่มีสถานะเอกสาร")
    status = DOCUMENT_STATUS_MAP.get(_status_key(raw))
    if status is None:
        raise RowError(f"ไม่รู้จักสถานะเอกสาร '{raw}'")
    return status


def parse_authorized(value: Any) -> bool | None:
    raw = _text(value)
    if raw is None:
        return None
    key = _status_key(raw)
    if key not in AUTHORIZED_MAP:
        raise RowError(f"ไม่รู้จักสถานะมอบอำนาจ '{raw}'")
    return AUTHORIZED_MAP[key]


def parse_edited(value: Any) -> bool | None:
    raw = _text(value)
    if raw is None:
        return None
    key = raw.lower()
    if key not in EDITED_MAP:
        raise RowError(f"ค่าคอลัมน์ 'แก้ไข' ต้องเป็น Y หรือ N (ได้ '{raw}')")
    return EDITED_MAP[key]


def parse_company(company: Any, company_name: Any) -> CompanyName:
    """'บริษัท' ไทย -> company_th (ตัดคำว่า บริษัท หน้าสุดออก), อังกฤษ -> company_en
    'Company Name' -> aliases ทั้งก้อนเป็นชื่อเดียว"""
    name = _text(company)
    alias = _text(company_name)
    if name is None:
        raise RowError("ไม่มีชื่อบริษัท")

    company_th = company_en = None
    if _is_thai(name):
        # company_th = _COMPANY_PREFIX.sub("", name).strip() or name
        company_th = name
    else:
        company_en = name

    return CompanyName(
        company_th=company_th,
        company_en=company_en,
        aliases=[alias] if alias else None,
    )


def _strip_khun(text: str | None) -> str | None:
    if not text:
        return None
    return _KHUN.sub("", text).strip() or None


def parse_coordinators(value: Any) -> list[dict]:
    """'คุณสันติพงษ์ (คุณแทน)' -> name_th=สันติพงษ์, nickname=แทน
    'Karnthida Wannasiwaporn (Mai)' -> name_en=Karnthida Wannasiwaporn, nickname=Mai
    หลายคนมาเป็นบรรทัดขึ้นต้นด้วย '-'"""
    if value is None:
        return []
    people = []
    for line in str(value).splitlines():
        line = _SPACES.sub(" ", line).strip().lstrip("-–•*").strip()
        if not line:
            continue

        m = re.fullmatch(r"(.*?)\s*[(（]\s*(.*?)\s*[)）]?\s*", line)
        name, nickname = (m.group(1), m.group(2)) if m else (line, None)
        name = _strip_khun(name)
        nickname = _strip_khun(nickname)
        if not name and not nickname:
            continue

        person = {"name_th": None, "name_en": None, "nickname": nickname}
        if name:
            person["name_th" if _is_thai(name) else "name_en"] = name
        people.append(person)
    return people


# --------------------------------------------------------------------------- #
# อ่านไฟล์
# --------------------------------------------------------------------------- #

@dataclass
class ParsedRow:
    no: str
    company: CompanyName
    mou: dict
    people: list[dict] = field(default_factory=list)


def _row_no(cells: dict[str, Any], excel_row: int) -> str:
    return _text(cells.get(COL_NO)) or f"(แถว {excel_row} ใน excel)"


def parse_row(cells: dict[str, Any], excel_row: int) -> ParsedRow:
    """แปลงหนึ่งแถว - โยน RowError ถ้าข้อมูลผิด (ยังไม่แตะฐานข้อมูล)"""
    mou: dict[str, Any] = {
        "document_status": parse_document_status(cells.get(COL_DOC_STATUS)),
        "is_authorized": parse_authorized(cells.get(COL_AUTH_STATUS)),
        "is_edited": parse_edited(cells.get(COL_EDITED)),
    }
    for column, key in TEXT_COLUMNS.items():
        mou[key] = _text(cells.get(column))
    for column, key in DATE_COLUMNS.items():
        mou[key] = parse_thai_date(cells.get(column), column)

    return ParsedRow(
        no=_row_no(cells, excel_row),
        company=parse_company(cells.get(COL_COMPANY), cells.get(COL_COMPANY_NAME)),
        mou=mou,
        people=parse_coordinators(cells.get(COL_COORDINATOR)),
    )


def read_rows(content: bytes):
    """yield (เลขแถว excel, {หัวคอลัมน์: ค่า}) - ข้ามแถวที่ว่างทั้งแถว"""
    try:
        wb = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    except Exception as e:
        raise BadRequestError(message="อ่านไฟล์ไม่ได้ กรุณาใช้ไฟล์ .xlsx") from e

    try:
        ws = wb.worksheets[0]
        rows = ws.iter_rows(values_only=True)
        header_row = next(rows, None)
        if not header_row:
            raise BadRequestError(message="ไฟล์ไม่มีหัวคอลัมน์")

        headers = [_SPACES.sub(" ", str(h)).strip() if h is not None else None for h in header_row]
        missing = [c for c in REQUIRED_COLUMNS if c not in headers]
        if missing:
            raise BadRequestError(message=f"ไฟล์ไม่มีคอลัมน์: {', '.join(missing)}")

        for index, values in enumerate(rows, start=2):
            cells = {h: v for h, v in zip(headers, values) if h}
            used = {k: v for k, v in cells.items() if k in REQUIRED_COLUMNS and k != COL_NO}
            if all(_text(v) is None for v in used.values()):
                continue
            yield index, cells
    finally:
        wb.close()


# --------------------------------------------------------------------------- #
# เขียนฐานข้อมูล
# --------------------------------------------------------------------------- #

@dataclass
class ImportedRow:
    """id ที่ commit แล้ว - ใช้ยิงงาน outbox ไปกราฟทีหลัง"""
    company_id: int
    employee_ids: list[int]


def _write_row(row: ParsedRow, user_id: int, conn: Any) -> ImportedRow:
    company_id = sync_create_company(row.company, group_id=None, conn=conn)
    if not company_id:
        raise RowError("ไม่สามารถสร้างบริษัทได้")

    create_mou_pg(MouBase(company_id=company_id, **row.mou), conn=conn)

    employee_ids = []
    for person in row.people:
        employee = sync_create_employee(
            EmployeeBase(
                **person,
                status=ContactStatus.ACTIVE,
                relevant=RelevantType.GENERAL,
                company_id=company_id,
            ),
            user_id=user_id,
            conn=conn,
        )
        employee_ids.append(employee.id)

    return ImportedRow(company_id=company_id, employee_ids=employee_ids)


def _error_message(error: Exception) -> str:
    if isinstance(error, (RowError,)):
        return str(error)
    if isinstance(error, AppException):
        return error.message
    if isinstance(error, psycopg2.Error):
        detail = (error.diag.message_primary if error.diag else None) or str(error)
        return f"ฐานข้อมูลไม่รับข้อมูลแถวนี้: {detail}"
    return f"เกิดข้อผิดพลาด: {error}"


def _rollback(conn: Any) -> None:
    try:
        conn.rollback()
    except psycopg2.Error:
        pass


def import_mou_xlsx(content: bytes, user_id: int) -> tuple[ImportResult, list[ImportedRow]]:
    """นำเข้าทั้งไฟล์ - คืนผลสรุป + รายการ id ที่ต้องยิงงานกราฟต่อ"""
    if not user_id:
        raise BadRequestError()
    if not content:
        raise BadRequestError(message="ไฟล์ว่างเปล่า")
    if len(content) > MAX_FILE_BYTES:
        raise BadRequestError(message="ไฟล์ใหญ่เกิน 10MB")

    result = ImportResult()
    imported: list[ImportedRow] = []

    rows = list(read_rows(content))  # อ่านให้จบก่อน: หัวคอลัมน์ผิดต้องพังก่อนแตะฐานข้อมูล
    result.total = len(rows)

    with nl_db.get_connection() as conn:
        for excel_row, cells in rows:
            no = _row_no(cells, excel_row)
            try:
                parsed = parse_row(cells, excel_row)
                written = _write_row(parsed, user_id=user_id, conn=conn)
                conn.commit()  # ครบทั้ง companies + mous + employees แล้วเท่านั้น
                imported.append(written)
                result.success += 1
            except Exception as error:  # noqa: BLE001 - แถวเดียวพังต้องไม่ล้มทั้งไฟล์
                _rollback(conn)
                message = _error_message(error)
                logger.warning("import mou: No %s ไม่สำเร็จ: %s", no, message)
                result.failed.append(ImportRowError(no=no, message=message))

    logger.info(
        "import mou: ทั้งหมด %d แถว สำเร็จ %d ไม่สำเร็จ %d",
        result.total, result.success, len(result.failed),
    )
    return result, imported


def flush_imported(imported: list[ImportedRow]) -> None:
    """ยิงงานกราฟที่ import จองไว้ - บริษัทก่อน แล้วค่อยคน (MERGE คนต้อง MATCH บริษัท)

    ไม่สำเร็จก็ไม่เป็นไร แถว outbox ยังค้างอยู่และ replay ตามรอบจะเก็บให้
    """
    for row in imported:
        try:
            outbox.flush(outbox.COMPANY, row.company_id)
            for employee_id in row.employee_ids:
                outbox.flush(outbox.EMPLOYEE, employee_id)
        except Exception:  # noqa: BLE001
            logger.exception("import mou: flush กราฟของบริษัท %s ไม่สำเร็จ", row.company_id)
