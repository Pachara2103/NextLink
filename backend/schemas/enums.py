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
    UNDER_REVISION_BY_CHULA_LEGAL_COUNSEL = "under_revision_by_chula_legal_counsel"  # แก้ไขที่นิติกรจุฬาฯ
    UNDER_REVIEW_BY_COMPANY_LEGAL_COUNSEL = "under_review_by_company_legal_counsel"  # นิติกรบริษัท
    AUTHORIZATION = "authorization"                                                  # มอบอำนาจ
    AWAITING_MOU_SIGNING = "awaiting_mou_signing"                                    # รอลงนาม MoU
    SIGNED = "signed"                                                                # ลงนามแล้ว
    SIGNED_AT_UNIVERSITY_LEVEL = "signed_at_university_level"                        # ลงนามมหาวิทยาลัย
    SIGNED_AFFILIATED_COMPANY = "signed_affiliated_company"                          # ลงนามแล้ว (บริษัทในเครือ)
    INTERNAL_CHULA_UNIT = "internal_chula_unit"                                      # หน่วยงานภายในจุฬา
    DECLINED_TO_SIGN = "declined_to_sign"                                            # ปฏิเสธการลงนาม
    NOT_YET_SIGNED = "not_yet_signed"                                                # ยังไม่ได้ลงนาม
