from langchain_core.prompts import ChatPromptTemplate
from schemas.extraction import ExtractionList
from core.ai import get_llm

GET_CONTACT_PROMPT = """
คุณคือ AI ผู้เชี่ยวชาญด้านการสกัดข้อมูลติดต่อและข้อมูลบริษัทจากประวัติการสนทนา
[ภารกิจ]
จงวิเคราะห์ประวัติการสนทนาที่ได้รับ และสกัดข้อมูลตามโครงสร้างที่กำหนด
- สกัดข้อมูลเฉพาะที่มีอยู่จริงในข้อความสนทนาเท่านั้น ห้ามคาดเดาหรือสร้างข้อมูลขึ้นมาเอง
- หากชื่อบริษัที่เจอในประวัติการสนทนาไม่ตรงกัน ให้ใช้ชื่อแรกที่เจอเป็นหลัก
"""

contact_prompt = ChatPromptTemplate.from_messages([
    ("system", GET_CONTACT_PROMPT),
    ("user", "Chat History:\n{chat_history}")
])

_chain = None

def get_extract_contact_chain():
    global _chain
    if _chain is None:
        _chain = contact_prompt | get_llm().with_structured_output(ExtractionList)
    return _chain
