from core.db import graph_db
from ai.services.format import person_cotact_format
from core.db import pg_db
from core.exceptions import DatabaseError
def get_search_query(input: str) -> str:
    return  f"{input}^2 OR {input}~2 OR {input}*"
  


def search_person(name: str) -> list:
    search_query = get_search_query(name)
    query  = """
CALL db.index.fulltext.queryNodes("personNameIndex", $searchTerm) 
YIELD node, score
LIMIT 10

OPTIONAL MATCH (c:Company)-[:HAS_COORDINATOR]->(node)

RETURN 
       labels(node)[0] AS label,
       node.nameEn AS nameEn, 
       node.nameTh AS nameTh, 
       node.nickname AS nickname,
       node.phone AS phone,
       node.email AS email, 
       c.companyEn AS companyEn, 
       c.companyTh AS companyTh, 
       score
"""
    with graph_db.get_session() as session:
      result = session.run(query, searchTerm=search_query)
      return result.data()

def search_company(input: str) -> list:
    query  = f"""
CALL db.index.fulltext.queryNodes("companyNameIndex", $searchTerm) 
YIELD node, score
RETURN node.id AS id, node.companyEn AS company_en, node.companyTh AS company_th, node.aliases AS aliases
LIMIT 10;
"""
    search_query = f"{input}^2 OR {input}~2 OR {input}*"
    with graph_db.get_session() as session:
       result = session.run(query, searchTerm=search_query)
       return result.data()
   

status_mapping = {
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

def get_mou_status(company_list: list) -> list:
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
                    status = status_mapping.get(row[1], row[1])
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
            

def get_person_contact(name: str):
    result = search_person(name)
    return  person_cotact_format(result)

def get_company_mou(name: str):
    result = search_company(name)
    return result


from utils.tokenizer import thai_tokenizer
from core.ai import get_embedder
def get_revalent_note(text: str):
    query = """
CALL db.index.fulltext.queryNodes('noteIndex', $searchString) YIELD node, score
WITH node, score AS textScore 
WITH collect({id: node.id, groupId: node.groupId, personId: node.personId, textScore: textScore, vectorScore: 0.0}) AS textResults
LIMIT 10

MATCH (target:Note)
SEARCH target IN ( VECTOR INDEX vectorNoteIndex FOR $queryEmbedding LIMIT 10 )
SCORE AS vectorScore
WITH textResults, collect({id: target.id, groupId: node.groupId, personId: node.personId, textScore: 0.0, vectorScore: vectorScore}) AS vectorResults

WITH textResults + vectorResults AS allResults
UNWIND allResults AS item
with item.id AS id, item.content AS content, sum(item.textScore) AS totalTextScore, sum(item.vectorScore) AS totalVectorScore

RETURN id, (totalTextScore + totalVectorScore) AS totalScore
ORDER BY totalScore DESC
"""
    search_text = thai_tokenizer(text)
    embedder = get_embedder()
    embedding = embedder.embed_query(search_text)
    with graph_db.get_session() as session:
       result = session.run(query, searchString=search_text, queryEmbedding=embedding)
       return result.data()
   