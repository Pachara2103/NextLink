from langchain_core.tools import tool


# @tool
# def get_sales_report(start_date: str, end_date: str, category: str = None) -> list:
#     """ดึงยอดขายสินค้าตามช่วงวันที่และประเภทสินค้าที่กำหนด
    
#     Args:
#         start_date: วันที่เริ่มต้น รูปแบบ YYYY-MM-DD
#         end_date: วันที่สิ้นสุด รูปแบบ YYYY-MM-DD
#         category: ประเภทสินค้า (Optional) ถ้าไม่ใส่จะดึงทุกประเภท
#     """
#     # เขียน SQL Query ที่ตั้งไว้เรียบร้อย (Parameterized Query)
#     query = """
#         SELECT category_name, SUM(amount) as total_sales, COUNT(*) as total_orders
#         FROM sales
#         WHERE sale_date BETWEEN %s AND %s
#     """
#     params = [start_date, end_date]

#     if category:
#         query += " AND category_name = %s"
#         params.append(category)

#     query += " GROUP BY category_name;"

#     # Connect DB และ Execute (แนะนำให้ใช้ Connection Pool)
#     conn = psycopg2.connect("postgresql://user:password@localhost:5432/mydb")
#     cursor = conn.cursor()
#     cursor.execute(query, tuple(params))
#     results = cursor.fetchall()
    
#     cursor.close()
#     conn.close()
    
#     return results