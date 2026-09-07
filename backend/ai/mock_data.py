mock_company_and_coordinator = """
UNWIND [
  {
    c_id: 1, c_groupId: "GRP-001", companyTh: "ปตท. จำกัด (มหาชน)", companyEn: "PTT Public Company Limited", aliases: ["ปตท", "PTT"],
    coords: [
      {id: 101, status: "active", nameTh: "สมชาย ใจดี", nameEn: "Somchai Jaidee", nickname: "ชาย", job_title: "Procurement Manager", phone: "081-111-1111", email: "somchai@ptt.com", relevant: "ผู้ดูแลหลัก"},
      {id: 102, status: "active", nameTh: "วิภาดา รักชาติ", nameEn: "Wiphada Rakchat", nickname: "ภา", job_title: "Assistant Manager", phone: "081-111-1112", email: "wiphada@ptt.com", relevant: "ผู้ดูแลสำรอง"}
    ]
  },
  {
    c_id: 2, c_groupId: "GRP-001", companyTh: "เอสซีจี แพคเกจจิ้ง", companyEn: "SCG Packaging", aliases: ["SCGP", "เอสซีจีแพค"],
    coords: [
      {id: 103, status: "active", nameTh: "กิตติศักดิ์ มั่นคง", nameEn: "Kittisak Mankong", nickname: "กิต", job_title: "Account Executive", phone: "082-222-2221", email: "kittisak@scg.com", relevant: "ประสานงานทั่วไป"},
      {id: 104, status: "pending", nameTh: "นภาพร สุขใจ", nameEn: "Napaporn Sukjai", nickname: "ภา", job_title: "Coordinator", phone: "082-222-2222", email: "napaporn@scg.com", relevant: "ประสานงานเอกสาร"}
    ]
  },
  {
    c_id: 3, c_groupId: "GRP-002", companyTh: "ซีพี ออลล์", companyEn: "CP ALL Public Company Limited", aliases: ["7-Eleven", "เซเว่น", "CPALL"],
    coords: [
      {id: 105, status: "active", nameTh: "ธนกฤต มีสุข", nameEn: "Thanakrit Meesuk", nickname: "ตั้ม", job_title: "Purchasing Lead", phone: "083-333-3331", email: "thanakrit@cpall.co.th", relevant: "จัดซื้อสินค้า"},
      {id: 106, status: "active", nameTh: "อารียา เจริญ", nameEn: "Areeya Charoen", nickname: "มิว", job_title: "Vendor Specialist", phone: "083-333-3332", email: "areeya@cpall.co.th", relevant: "ติดต่อ Supplier"}
    ]
  },
  {
    c_id: 4, c_groupId: "GRP-002", companyTh: "เจริญโภคภัณฑ์อาหาร", companyEn: "Charoen Pokphand Foods", aliases: ["CPF", "ซีพีเอฟ"],
    coords: [
      {id: 107, status: "active", nameTh: "ประวิทย์ เจริญยิ่ง", nameEn: "Prawit Chareonying", nickname: "วิทย์", job_title: "Supply Chain Analyst", phone: "084-444-4444", email: "prawit@cpf.co.th", relevant: "วิเคราะห์ห่วงโซ่อุปทาน"}
    ]
  },
  {
    c_id: 5, c_groupId: "GRP-003", companyTh: "แอดวานซ์ อินโฟร์ เซอร์วิส", companyEn: "Advanced Info Service", aliases: ["AIS", "เอไอเอส"],
    coords: [
      {id: 108, status: "active", nameTh: "ชลธิชา บุญมี", nameEn: "Chonticha Boonmee", nickname: "ปลา", job_title: "Corporate Relations", phone: "085-555-5555", email: "chonticha@ais.co.th", relevant: "ลูกค้าองค์กร"}
    ]
  },
  {
    c_id: 6, c_groupId: "GRP-003", companyTh: "ทรู คอร์ปอเรชั่น", companyEn: "True Corporation", aliases: ["TRUE", "ทรู", "dtac"],
    coords: [
      {id: 109, status: "active", nameTh: "ณัฐพล พรหมดี", nameEn: "Nattapol Promdee", nickname: "นัท", job_title: "Partnership Manager", phone: "086-666-6666", email: "nattapol@true.th", relevant: "พันธมิตรธุรกิจ"}
    ]
  },
  {
    c_id: 7, c_groupId: "GRP-004", companyTh: "ธนาคารกสิกรไทย", companyEn: "Kasikornbank", aliases: ["KBank", "กสิกร"],
    coords: [
      {id: 110, status: "active", nameTh: "ศุภชัย วงศ์ใหญ่", nameEn: "Suphachai Wongyai", nickname: "โหน่ง", job_title: "Relationship Manager", phone: "087-777-7777", email: "suphachai@kbank.com", relevant: "สินเชื่อธุรกิจ"}
    ]
  },
  {
    c_id: 8, c_groupId: "GRP-004", companyTh: "ธนาคารไทยพาณิชย์", companyEn: "Siam Commercial Bank", aliases: ["SCB", "ไทยพาณิชย์"],
    coords: [
      {id: 111, status: "active", nameTh: "พิมลพรรณ ดีเลิศ", nameEn: "Pimonpan Deelert", nickname: "พิม", job_title: "Client Service", phone: "088-888-8888", email: "pimonpan@scb.co.th", relevant: "บริการลูกค้า"}
    ]
  },
  {
    c_id: 9, c_groupId: "GRP-004", companyTh: "ธนาคารกรุงเทพ", companyEn: "Bangkok Bank", aliases: ["BBL", "แบงก์กรุงเทพ"],
    coords: [
      {id: 112, status: "pending", nameTh: "อนันต์ ปัญญา", nameEn: "Anan Panya", nickname: "นัน", job_title: "Financial Officer", phone: "089-999-9999", email: "anan@bbl.co.th", relevant: "ธุรกรรมการเงิน"}
    ]
  },
  {
    c_id: 10, c_groupId: "GRP-005", companyTh: "เซ็นทรัล พัฒนา", companyEn: "Central Pattana", aliases: ["CPN", "เซ็นทรัล"],
    coords: [
      {id: 113, status: "active", nameTh: "วรรณิสา แก้วมณี", nameEn: "Wannisa Kaewmanee", nickname: "ฝน", job_title: "Leasing Executive", phone: "080-000-0001", email: "wannisa@cpn.co.th", relevant: "สัญญาเช่าพื้นที่"}
    ]
  },
  {
    c_id: 11, c_groupId: "GRP-005", companyTh: "ท่าอากาศยานไทย", companyEn: "Airports of Thailand", aliases: ["AOT", "การทอดอนเมือง", "การทอ"],
    coords: [
      {id: 114, status: "active", nameTh: "ธีรเดช สุวรรณ", nameEn: "Theeradech Suwan", nickname: "เดช", job_title: "Operations Coordinator", phone: "080-000-0002", email: "theeradech@aot.co.th", relevant: "ประสานงานท่าอากาศยาน"}
    ]
  },
  {
    c_id: 12, c_groupId: "GRP-006", companyTh: "ไทยเบฟเวอเรจ", companyEn: "Thai Beverage", aliases: ["ThaiBev", "ช้าง", "เบียร์ช้าง"],
    coords: [
      {id: 115, status: "active", nameTh: "กมลวรรณ ศรีสุข", nameEn: "Kamonwan Srisuk", nickname: "ส้ม", job_title: "Event Manager", phone: "080-000-0003", email: "kamonwan@thaibev.com", relevant: "จัดกิจกรรมทางการตลาด"}
    ]
  },
  {
    c_id: 13, c_groupId: "GRP-006", companyTh: "กัลฟ์ เอ็นเนอร์จี ดีเวลลอปเมนท์", companyEn: "Gulf Energy Development", aliases: ["GULF", "กัลฟ์"],
    coords: [
      {id: 116, status: "pending", nameTh: "ปิยะพงษ์ สุขสันต์", nameEn: "Piyapong Suksan", nickname: "ป๊อบ", job_title: "Project Engineer", phone: "080-000-0004", email: "piyapong@gulf.co.th", relevant: "วิศวกรโครงการ"}
    ]
  },
  {
    c_id: 14, c_groupId: "GRP-007", companyTh: "บ้านปู", companyEn: "Banpu Public Company Limited", aliases: ["BANPU"],
    coords: [
      {id: 117, status: "active", nameTh: "จิราพร สมบูรณ์", nameEn: "Jiraporn Somboon", nickname: "จิ๊บ", job_title: "ESG Specialist", phone: "080-000-0005", email: "jiraporn@banpu.co.th", relevant: "ด้านความยั่งยืน"}
    ]
  },
  {
    c_id: 15, c_groupId: "GRP-007", companyTh: "พลังงานบริสุทธิ์", companyEn: "Energy Absolute", aliases: ["EA", "อีเอ"],
    coords: [
      {id: 118, status: "active", nameTh: "ภานุพงศ์ ทองแท้", nameEn: "Panupong Thongtae", nickname: "พงษ์", job_title: "Business Development", phone: "080-000-0006", email: "panupong@ea.co.th", relevant: "พัฒนาธุรกิจพลังงาน"}
    ]
  }
] AS data

// 1. สร้าง Node Company
CREATE (c:Company {
  id: data.c_id,
  groupId: data.c_groupId,
  companyTh: data.companyTh,
  companyEn: data.companyEn,
  aliases: data.aliases,
  createdAt: datetime(),
  updatedAt: datetime()
})

// 2. สร้าง Node Coordinator และผูก Relationship
WITH c, data
UNWIND data.coords AS coord
CREATE (co:Coordinator {
  id: coord.id,
  groupId: data.c_groupId,
  status: coord.status,
  nameTh: coord.nameTh,
  nameEn: coord.nameEn,
  nickname: coord.nickname,
  jobTitle: coord.job_title,
  phone: coord.phone,
  email: coord.email,
  relevant: coord.relevant,
  createdAt: datetime(),
  updatedAt: datetime()
})
CREATE (c)-[:HAS_COORDINATOR]->(co)
"""