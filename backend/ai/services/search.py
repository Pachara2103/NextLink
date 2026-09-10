from core.db import graph_db

def get_search_query(input: str) -> str:
    return  f"{input}^2 OR {input}~2 OR {input}*"

def search_person(name: str) -> list:
    search_query = get_search_query(name)
    query  = """
CALL db.index.fulltext.queryNodes("personNameIndex", $searchTerm) 
YIELD node, score
LIMIT 10

OPTIONAL MATCH (c:Company)-[:HAS_EMPLOYEE]->(node)

RETURN 
       node.nameEn AS name_en,
       node.nameTh AS name_th, 
       node.nickname AS nickname,
       node.phone AS phone,
       node.email AS email, 
       c.companyEn AS company_en, 
       c.companyTh AS company_th, 
       c.aliases AS aliases
"""
    with graph_db.get_session() as session:
      result = session.run(query, searchTerm=search_query)
      return result.data()


def search_company(name: str) -> list:
    query  = f"""
CALL db.index.fulltext.queryNodes("companyNameIndex", $searchTerm) 
YIELD node, score
RETURN 
  node.id AS id, 
  node.companyEn AS company_en, 
  node.companyTh AS company_th, 
  node.aliases AS aliases
LIMIT 10;
"""
    search_query =  get_search_query(name)
    with graph_db.get_session() as session:
       result = session.run(query, searchTerm=search_query)
       return result.data()
