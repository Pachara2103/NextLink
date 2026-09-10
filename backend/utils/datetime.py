from zoneinfo import ZoneInfo 

def format_to_thai_time(dt):
    if not dt:
        return None
    
    if hasattr(dt, "to_native"):
        dt = dt.to_native()
    thai_dt = dt.astimezone(ZoneInfo("Asia/Bangkok"))
    return thai_dt.strftime("%Y-%m-%d %H:%M:%S")