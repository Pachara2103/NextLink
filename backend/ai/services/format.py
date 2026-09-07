def person_cotact_format(results: list) -> list:
    grouped = {}

    for row in results:
        c_th = row.get("companyTh")
        c_en = row.get("companyEn")

        if not c_th and not c_en:
            company_key = None
        elif c_th and c_en:
            company_key = f"{c_th} ({c_en})"
        else:
            company_key = c_th or c_en

        raw_label = row.get("label") or "person"
        role_key = f"{raw_label.lower()}s" if not raw_label.lower().endswith("s") else raw_label.lower()

        person = {
            "name_th": row.get("nameTh"),
            "name_en": row.get("nameEn"),
            "nickname": row.get("nickname"),
            "phone": row.get("phone"),
            "email": row.get("email"),
        }

        if company_key not in grouped:
            grouped[company_key] = {}

        if role_key not in grouped[company_key]:
            grouped[company_key][role_key] = []

        exists = any(
            p["name_th"] == person["name_th"]
            and p["name_en"] == person["name_en"]
            for p in grouped[company_key][role_key]
        )

        if not exists:
            grouped[company_key][role_key].append(person)

    output = []
    for comp, roles in grouped.items():
        comp_dict = {"company": comp}
        comp_dict.update(roles)
        output.append(comp_dict)

    return output


# def note_format(records):
    
#     markdown_lines = ["### Context\n"]
    
#     for idx, record in enumerate(records, start=1):
#         company_name = record.get("company_name", "N/A")
#         hr_list = [hr for hr in record.get("hr_list", []) if hrow.get("name")]
#         company_note_list = [note for note in record.get("company_note_list", []) if note.get("message")]
        
#         markdown_lines.append(f"{idx}. Company: {company_name}")
        
#         if hr_list:
#             markdown_lines.append("   - HR Personnel:")
#             for num, hr in enumerate(hr_list, start=1):
#                 name = hrow.get("name", "-")
#                 phone = hrow.get("phone", "-")
#                 status = hrow.get("status", "-")
#                 hr_notes = hrow.get("notes", [])
#                 clean_notes = [n for n in hr_notes if n]
#                 note_str = f" | โน้ต: {', '.join(clean_notes)}" if clean_notes else ""
        
#                 markdown_lines.append(f"     {num}. ชื่อ: {name} | โทร: {phone} | สถานะ: {status}{note_str}")
#         else:
#             markdown_lines.append("   - HR Personnel: (ไม่มีข้อมูล)")
            
#         if company_note_list:
#             markdown_lines.append("   - Notes for company:")
#             for note in company_note_list:
#                 date = note.get("created_at", "-")
#                 msg = note.get("message", "-")
#                 markdown_lines.append(f'     - {date}: {msg}')
#         else:
#             markdown_lines.append("   - Notes for company: (ไม่มีข้อมูล)")
            
#         markdown_lines.append("") 

#     return "\n".join(markdown_lines)