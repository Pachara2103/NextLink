from schemas.base import BasePersonName, BaseContactInfo, BaseTimestamp
from schemas.enums import ApprovalStatus

class CoordinatorCreate(BasePersonName, BaseContactInfo):
    """Schema for creating a new coordinator."""
    
class Coordinator(CoordinatorCreate, BaseTimestamp):
    id: int 
    status: ApprovalStatus
    group_id: str
    
    