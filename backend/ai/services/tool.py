from core.db import pg_db, graph_db
from ai.services.search import search_person, search_company
from utils.datetime import format_to_thai_time
import json

def get_company_name(items: dict) -> str:
    company_en = items.get("company_en", "<ไม่มีชื่อภาษาอังกฤษ>")
    company_th = items.get("company_th", "<ไม่มีชื่อภาษาไทย>")
    aliases = ", ".join(items.get("aliases")) if items.get("aliases") else "<ไม่มีชื่อย่อบริษัท>"
    return f"company_en: {company_en} company_th: {company_th} aliases: {aliases}"

def _json_to_string(json_data: dict) -> str:
    return json.dumps(json_data, ensure_ascii=False, indent=2)


MOU_STATUS_MAPPING = {
  'legal_revision_chula': 'แก้ไขที่นิติกรจุฬา',
  'company_legal_review': 'นิติกรบริษัท',
  'authorization': 'มอบอำนาจ',
  'pending_signature': 'รอลงนาม',
  'signed': 'ลงนามแล้ว',
  'signed_with_university': 'ลงนามกับมหาวิทยาลัย',
  'signed_subsidiary': 'ลงนามแล้ว (บ.ในเครือ)',
  'chula_department_review': 'หน่วยงานจุฬาฯ',
  'rejected': 'ปฏิเสธการลงนาม',
  'unsigned': 'ยังไม่ได้ลงนาม'
}


def get_mou_status(company_name: str) -> list:
    company_list = search_company(company_name)
    company_ids = [c.get("id") for c in company_list if c.get("id") is not None]
    
    if not company_ids:
        return []

    query = """
        SELECT company_id, document_status, is_authorized 
        FROM mous 
        WHERE company_id = ANY(%s)
    """
    
    db_map = {}
    with pg_db.get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(query, (company_ids,))
                rows = cursor.fetchall()
                for row in rows:
                    status = MOU_STATUS_MAPPING.get(row[1], row[1])
                    is_authorized = "มอบอำนาจแล้ว" if row[2] else "ยังไม่มอบอำนาจ"
                    db_map[row[0]] = {
                        "company_id": row[0],
                        "document_status": status,
                        "is_authorized": is_authorized
                    }

    mous = []
    for company in company_list:
        id = company.get("id")
        th = company.get("company_th")
        en = company.get("company_en")
        aliases = company.get("aliases")
        
        if id in db_map:
            db_map[id]["company_th"] = th
            db_map[id]["company_en"] = en
            db_map[id]["aliases"] = aliases
            mous.append(db_map[id])
        else:
            mous.append({
                "company_id": id,
                "document_status": "ไม่มีข้อมูล",
                "is_authorized": "ไม่มีข้อมูล",
                "company_th": th,
                "company_en": en,
                "aliases": aliases
            })

    return mous


def get_company_notes(company_name: str):
    """return 
    {
       "company_en: Tech Company Co., Ltd. company_th: เทคจำกัด aliases: Tech": [
       {
      "content": "test note",
      "note_type": "mou",
      "academic_year": 2026,
      "term": 1,
      "created_at": "2026-09-10 16:57:16",
      "updated_at": "2026-09-10 16:57:16"
        }
      ]
    }
  """
    company_list = search_company(company_name)
    company_notes = {}
    query = """
    MATCH (c:Company {id: $id})-[:HAS_NOTE]->(n:Note)
    RETURN 
     n.content AS content,  
     n.type as note_type, 
     n.academicYear as academic_year, 
     n.term as term,
     n.createdAt as created_at, 
     n.updatedAt as updated_at
    ORDER BY n.academicYear DESC, n.term DESC, n.createdAt DESC"""
    for company in company_list:
        company_id = company.get("id")
        company_key = get_company_name(company)
        if not company_id:
            continue

        with graph_db.get_session() as session:
            result = session.run(query, id=company_id)
            records = result.data()
            for row in records:
                row['created_at'] = format_to_thai_time(row['created_at'])
                row['updated_at'] = format_to_thai_time(row['updated_at'])
            company_notes[company_key] = records
    return _json_to_string(company_notes)
       
   
def get_company_contacts(company_name: str):
    """ return 
       {'company_en: Tech Company Co., Ltd. company_th: เทคจำกัด aliases: Tech': [
           {
               'name': 'a',
               'nickname': None,
               'role': 'instructor',
               'status': 'active',
               'phone': None,
               'email': None
            }]
        }
    """
    company_list = search_company(company_name)
    company_contacts = {}

    valid_companies = [
        (c.get("id"), get_company_name(c)) 
        for c in company_list if c.get("id")
    ]
    if not valid_companies:
        return company_contacts

    query = """
        select name, nickname, role, status, phone, email
        from contacts
        where company_id = %s;
    """

    with pg_db.get_connection() as conn:
        with conn.cursor() as cursor:
            for company_id, company_key in valid_companies:
                cursor.execute(query, (company_id,))
                columns = [desc[0] for desc in cursor.description]
                records = [dict(zip(columns, row)) for row in cursor.fetchall()]
                company_contacts[company_key] = records if records else "<ไม่มีรายชื่อผู้ติดต่อ>"
    return _json_to_string(company_contacts)



# query = """
# CALL db.index.fulltext.queryNodes('noteIndex', $searchString) YIELD node, score
# WITH node, score AS textScore 
# WITH collect({id: node.id, groupId: node.groupId, personId: node.personId, textScore: textScore, vectorScore: 0.0}) AS textResults
# LIMIT 10

# MATCH (target:Note)
# SEARCH target IN ( VECTOR INDEX vectorNoteIndex FOR $queryEmbedding LIMIT 10 )
# SCORE AS vectorScore
# WITH textResults, collect({id: target.id, groupId: node.groupId, personId: node.personId, textScore: 0.0, vectorScore: vectorScore}) AS vectorResults

# WITH textResults + vectorResults AS allResults
# UNWIND allResults AS item
# with item.id AS id, item.content AS content, sum(item.textScore) AS totalTextScore, sum(item.vectorScore) AS totalVectorScore

# RETURN id, (totalTextScore + totalVectorScore) AS totalScore
# ORDER BY totalScore DESC
# """