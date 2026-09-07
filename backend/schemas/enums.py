# schemas/enums.py
from enum import StrEnum

class ApprovalStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    DECLINED = "declined"

class RelevantType(StrEnum):
    MOU = "mou"; 
    ELECTIVE = "elective"; 
    INTERNSHIP = "internship"
    COOP = "coop"; 
    FRIDAY = "friday"; 

class ContactRole(StrEnum):
    """Who this company contact is to us. Mirrors the CHECK on contacts.role."""
    INSTRUCTOR = "instructor"
    SENIOR = "senior"
    ALUMNI = "alumni"
    INSIDER = "insider"

class ContactStatus(StrEnum):
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
    HR = "hr"
    COORDINATOR = "coordinator"; 
    INSTRUCTOR = "instructor"

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