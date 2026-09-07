from datetime import datetime

def get_current_academic_term(dt: datetime | None = None):
    if dt is None:
        dt = datetime.now()
        
    year_th = dt.year # คศ.
    month = dt.month
    
    if 8 <= month <= 12:
        # ส.ค. - ธ.ค. -> เทอม 1 ปีปัจจุบัน
        return year_th, 1
    elif 1 <= month <= 5:
        # ม.ค. - พ.ค. -> เทอม 2 (ยังเป็นปีการศึกษาก่อนหน้า)
        return year_th - 1, 2
    else:
        # มิ.ย. - ก.ค. -> เทอม 3 (ภาคฤดูร้อน ปีการศึกษาก่อนหน้า)
        return year_th - 1, 3