from schemas.base import BasePersonName, BaseContactInfo, BaseTimestamp
from schemas.enums import ContactStatus


class EmployeeExtraction(BasePersonName, BaseContactInfo):
     """Extracted from chat history"""
     
class EmployeeBase(EmployeeExtraction):
     status: ContactStatus
     company_id: int
    
class Employee(EmployeeBase, BaseTimestamp):
    id: int 
    
    