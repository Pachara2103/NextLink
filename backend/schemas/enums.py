from enum import StrEnum

class RelevantType(StrEnum):
    MOU = "mou"
    ELECTIVE = "elective"
    INTERNSHIP = "internship"
    COOP = "coop"
    FRIDAY = "friday"
    GENERAL = "general"
    
class ContactRole(StrEnum):
    INSTRUCTOR = "instructor"
    SENIOR = "senior"
    ALUMNI = "alumni"
    INSIDER = "insider"

class ContactStatus(StrEnum):
    PENDING = "pending"
    ACTIVE = "active"
    RESIGNED = "resigned"
    TRANSFERRED = "transferred"
    INACTIVE = "inactive"

class NoteType(StrEnum):
    MOU = "mou"; 
    ELECTIVE = "elective"; 
    INTERNSHIP = "internship"
    COOP = "coop"; 
    FRIDAY = "friday"; 
    PERSON = "person"

class NoteSource(StrEnum):
    INTERNAL = "internal";
    EXTERNAL = "external"


class Sentiment(StrEnum):
    POSITIVE = "positive"; 
    NEUTRAL = "neutral"
    WARNING = "warning"; 
    NEGATIVE = "negative"

class ChatRole(StrEnum):
    USER = "user"; 
    AI = "ai"

class MessageType(StrEnum):
    TEXT = "text"; 
    IMAGE = "image"; 
    STICKER = "sticker"; 
    OTHER = "other"

class TokenLogType(StrEnum):
    LINE_GROUP = "line_group"; CHAT = "chat"

class QuestionCategory(StrEnum):
    PERSONAL_CONTACT = "personal_contact"    
    MOU = "mou"
    RELATIONSHIP = "relationship"
    ACTIVITY = "activity"
    HISTORY = "history"
    OTHER = "other"
    
class DocumentStatus(StrEnum):
    LEGAL_REVISION_CHULA = "legal_revision_chula"
    COMPANY_LEGAL_REVIEW = "company_legal_review"
    AUTHORIZATION = "authorization"
    PENDING_SIGNATURE = "pending_signature"
    SIGNED = "signed"
    SIGNED_WITH_UNIVERSITY = "signed_with_university"
    SIGNED_SUBSIDIARY = "signed_subsidiary"
    CHULA_DEPARTMENT_REVIEW = "chula_department_review"
    REJECTED = "rejected"
    UNSIGNED = "unsigned"


# --------------------------------------------------------------------------- #
# วิชาเลือก (migrations/electives.sql)
#
# ค่าพวกนี้ต้องตรงกับ CHECK constraint ในตารางเป๊ะ ๆ และตรงกับสตริงที่หน้าเว็บ
# ใช้อยู่แล้ว - ตัวพิมพ์เล็ก/ใหญ่ที่ดูไม่เข้ากันข้างล่างจึงตั้งใจ: slot กับ
# สถานะเช็กลิสต์เป็นคำที่หน้าเว็บเก็บมาตั้งแต่ยังอยู่ใน localStorage การแปลง
# ตัวพิมพ์ระหว่างทางคือที่ที่ bug จะไปซ่อน
# --------------------------------------------------------------------------- #

class TermStatus(StrEnum):
    CURRENT = "current"
    ARCHIVED = "archived"


class RoomTier(StrEnum):
    """ห้องภาคจัดได้เลย ห้องคณะต้องยื่นขอก่อน ตัวจัดตารางจึงเลือกห้องภาคก่อนเสมอ"""

    READY = "ready"
    NEEDS_APPROVAL = "needs_approval"


class DeliveryMode(StrEnum):
    ON_SITE = "ON_SITE"
    HYBRID = "HYBRID"
    ONLINE = "ONLINE"


class SessionSource(StrEnum):
    AUTO = "auto"
    MANUAL = "manual"


class ElectiveSlot(StrEnum):
    """คาบประจำสัปดาห์: หกวัน (จ-ส) คูณสามช่วง = 18 คาบ

    หน่วยของตารางนี้คือคาบ ไม่ใช่วันที่ เพราะบริษัทตอบว่า "พุธเช้าสะดวก"
    """

    MON_AM = "MON_AM"; MON_PM = "MON_PM"; MON_EVE = "MON_EVE"
    TUE_AM = "TUE_AM"; TUE_PM = "TUE_PM"; TUE_EVE = "TUE_EVE"
    WED_AM = "WED_AM"; WED_PM = "WED_PM"; WED_EVE = "WED_EVE"
    THU_AM = "THU_AM"; THU_PM = "THU_PM"; THU_EVE = "THU_EVE"
    FRI_AM = "FRI_AM"; FRI_PM = "FRI_PM"; FRI_EVE = "FRI_EVE"
    SAT_AM = "SAT_AM"; SAT_PM = "SAT_PM"; SAT_EVE = "SAT_EVE"


class ReceiptStatus(StrEnum):
    """จดหมายเป็นของที่ "รอ" จึงมีสถานะกลางว่าขอไปแล้วแต่ยังไม่กลับมา"""

    NOT_RECEIVED = "NOT_RECEIVED"
    IN_PROGRESS = "IN_PROGRESS"
    RECEIVED = "RECEIVED"


class DoneStatus(StrEnum):
    """งาน MCV เจ้าหน้าที่ทำเอง จบหรือไม่จบเท่านั้น - "กำลังทำ" แปลว่าเปิดแท็บค้างไว้"""

    NOT_DONE = "NOT_DONE"
    DONE = "DONE"