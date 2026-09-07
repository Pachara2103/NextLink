import type {
  ContactPersonStatus,
  ContactRole,
  CoordinatorUpdate,
  RelevantType,
  SortOption,
} from "@/types";

/** Sentinel the extraction pipeline writes when a field could not be found. */
export const NO_DATA = "<ไม่มีข้อมูล>";

/**
 * How many short names one company may carry. Enforced in the form, and quoted
 * by MESSAGES.aliasLimitReached, so the number is written once.
 */
export const MAX_ALIASES = 3;

/**
 * The activity values, with the label each one reads as. Keys are the enum
 * values `schemas/enums.py::RelevantType` accepts — the API rejects anything
 * else, so the select must send the value and show the label, never the other
 * way round. Labels follow design/note.html, which names the same enum.
 */
export const RELEVANT_LABELS = {
  mou: "MOU",
  elective: "วิชาเลือก",
  internship: "ฝึกงาน",
  coop: "สหกิจ",
  friday: "บรรยาย",
} as const satisfies Record<RelevantType, string>;

/** Options for the activity select, with "ไม่ระบุ" as the empty choice. */
export const RELEVANT_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: NO_DATA },
  ...(Object.keys(RELEVANT_LABELS) as RelevantType[]).map((value) => ({
    value,
    label: RELEVANT_LABELS[value],
  })),
];

/**
 * contacts.role, with the label each value reads as. Keys are the values the
 * CHECK on the column accepts — the API rejects anything else, so the select
 * sends the value and shows the label, never the other way round.
 */
export const CONTACT_ROLE_LABELS = {
  instructor: "อาจารย์",
  senior: "รุ่นพี่",
  alumni: "ศิษย์เก่า",
  insider: "คนภายใน",
} as const satisfies Record<ContactRole, string>;

export const CONTACT_ROLE_OPTIONS: { value: ContactRole; label: string }[] = (
  Object.keys(CONTACT_ROLE_LABELS) as ContactRole[]
).map((value) => ({ value, label: CONTACT_ROLE_LABELS[value] }));

/** contacts.status — whether they are still reachable at that company. */
export const CONTACT_STATUS_LABELS = {
  active: "ยังติดต่อได้",
  resigned: "ลาออกแล้ว",
  transferred: "ย้ายหน่วยงาน",
  inactive: "ติดต่อไม่ได้",
} as const satisfies Record<ContactPersonStatus, string>;

export const CONTACT_STATUS_OPTIONS: {
  value: ContactPersonStatus;
  label: string;
}[] = (Object.keys(CONTACT_STATUS_LABELS) as ContactPersonStatus[]).map(
  (value) => ({ value, label: CONTACT_STATUS_LABELS[value] }),
);

/**
 * The one declaration of the coordinator's editable fields: their names, their
 * order, and their labels. `COORDINATOR_FIELDS` and `CoordinatorField` are
 * derived from it, so adding a field here is the whole change — the form, the
 * summary grid and the draft type all follow.
 */
export const COORDINATOR_FIELD_LABELS = {
  nameTh: "ชื่อผู้ประสานงาน (TH)",
  nameEn: "ชื่อผู้ประสานงาน (EN)",
  nickname: "ชื่อเล่น",
  jobTitle: "ตำแหน่ง",
  phone: "เบอร์โทร",
  email: "อีเมล",
  relevant: "กิจกรรมที่เกี่ยวข้อง",
} as const satisfies Record<string, string>;

export type CoordinatorField = keyof typeof COORDINATOR_FIELD_LABELS;

/** Field order drives both the summary list and the two-column form. */
export const COORDINATOR_FIELDS = Object.keys(
  COORDINATOR_FIELD_LABELS,
) as CoordinatorField[];

/**
 * Fails to compile if a field above stops existing on the PUT body — which is
 * how a rename in backend/schemas/ reaches this file instead of turning into a
 * silent 422 at runtime.
 */
type _FieldsExistOnApi = CoordinatorField extends keyof CoordinatorUpdate
  ? true
  : never;
const _fieldsExistOnApi: _FieldsExistOnApi = true;
void _fieldsExistOnApi;

/** Form state: every field is a string, because an empty input is "" not null. */
export type CoordinatorDraft = Record<CoordinatorField, string>;

export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "time-desc", label: "เวลา (ใหม่สุด)" },
  { value: "time-asc", label: "เวลา (เก่าสุด)" },
  { value: "group-name", label: "ชื่อกลุ่มไลน์" },
  { value: "company-th", label: "ชื่อบริษัทภาษาไทย" },
  { value: "company-en", label: "ชื่อบริษัทภาษาอังกฤษ" },
];

export const ITEMS_PER_PAGE = 5;

/**
 * The card grid caps at 3 columns × 2 rows; anything past that pages, the same
 * way the list does.
 */
export const GRID_ITEMS_PER_PAGE = 6;

export const MESSAGES = {
  requireCoordinatorName: "กรุณากรอกชื่อผู้ประสานงาน (อย่างน้อยหนึ่งภาษา)",
  requireCompanyName: "กรุณากรอกหรือเลือกชื่อบริษัท",
  coordinatorSaveFailed: "เกิดข้อผิดพลาดในการบันทึกข้อมูล กรุณาลองใหม่อีกครั้ง",
  companySaveFailed: "เกิดข้อผิดพลาดในการเพิ่มชื่อบริษัท กรุณาลองใหม่อีกครั้ง",

  /**
   * What each toast leads with when the API sent a reason of its own. The
   * backend names the cause ("ไม่พบบริษัทของกลุ่มนี้ในฐานข้อมูล"); only the
   * console knows which action the user was taking when it happened.
   */
  syncPrefix: "โหลดข้อมูลไม่สำเร็จ",
  coordinatorPrefix: "บันทึกข้อมูลผู้ประสานงานไม่สำเร็จ",
  declinePrefix: "ลบข้อมูลผู้ประสานงานไม่สำเร็จ",
  companyPrefix: "บันทึกชื่อบริษัทไม่สำเร็จ",
  loginPrefix: "เข้าสู่ระบบไม่สำเร็จ",

  /** The company write never reached the API. */
  companyNetworkFailed:
    "บันทึกชื่อบริษัทไม่สำเร็จ: เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบการเชื่อมต่อ",
  /** 5xx: PostgreSQL or the Neo4j half of the write broke. */
  companyDbFailed:
    "บันทึกชื่อบริษัทไม่สำเร็จ: ฐานข้อมูลมีปัญหา กรุณาลองใหม่อีกครั้ง",
  companyNotFound: "บันทึกผู้ประสานงานแล้ว แต่ไม่พบบริษัทของกลุ่มนี้ในฐานข้อมูล",
  /** API answered 404: no Company node carries this company id. */
  coordinatorGroupNotMatched:
    "บันทึกข้อมูลไม่สำเร็จ: ไม่พบบริษัทของกลุ่มนี้ในฐานข้อมูล กรุณาเพิ่มชื่อบริษัทก่อน",
  /** API answered 5xx: the Neo4j write itself failed. */
  coordinatorDbFailed:
    "บันทึกข้อมูลไม่สำเร็จ: ฐานข้อมูลมีปัญหา กรุณาลองใหม่อีกครั้ง",
  /** Never reached the API at all (network down, dev server not running). */
  coordinatorNetworkFailed:
    "บันทึกข้อมูลไม่สำเร็จ: เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบการเชื่อมต่อ",
  /** A /api/v1/line/* read answered 5xx: Postgres or the extraction chain broke. */
  syncServerFailed:
    "โหลดข้อมูลไม่สำเร็จ: เซิร์ฟเวอร์มีปัญหา กรุณาลองใหม่อีกครั้ง",
  /** 404: the route is not there, usually a stale API_ORIGIN or an old  */
  syncNotFound:
    "โหลดข้อมูลไม่สำเร็จ: ไม่พบปลายทาง API กรุณาตรวจสอบเวอร์ชันของเซิร์ฟเวอร์",
  /** Any other non-2xx. */
  syncFailed:
    "โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
  /** The read never reached the API at all. */
  syncNetworkFailed:
    "โหลดข้อมูลไม่สำเร็จ: เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบการเชื่อมต่อ",
  /**
   * POST /line/update-information ไม่ตอบกลับ แต่ request ที่อ่านข้อมูลหลังจาก
   * นั้นตอบปกติ
   *
   * ไม่พูดว่า "ไม่สำเร็จ" เพราะฝั่ง server มัก commit ไปแล้วจริง ๆ (มันเขียน
   * ทีละกลุ่มแล้ว commit ทันที) รายการที่เห็นอยู่คืออ่านสด ๆ จากฐานข้อมูลหลัง
   * งานนั้นจบ - ที่ไม่รู้คือมันไปถึงกลุ่มสุดท้ายหรือยัง
   */
  updateNotConfirmed:
    "ไม่ได้รับผลการอัปเดตจากเซิร์ฟเวอร์ (คำขอใช้เวลานานเกินไป) รายการด้านล่างอ่านใหม่จากฐานข้อมูลแล้ว แต่อาจยังไม่ครบทุกกลุ่ม",
  // --- login ---
  /** 401: the API checked and the pair is wrong. */
  loginBadCredentials: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง",
  /** Caught before the request goes out. */
  loginRequireFields: "กรุณากรอกชื่อผู้ใช้และรหัสผ่าน",
  /** 422: the body did not match what the API expects. */
  loginBadRequest: "ข้อมูลที่ส่งไม่ถูกต้อง กรุณาตรวจสอบชื่อผู้ใช้และรหัสผ่านอีกครั้ง",
  /** 5xx: Postgres or the login lookup itself broke. */
  loginServerFailed:
    "เข้าสู่ระบบไม่สำเร็จ: เซิร์ฟเวอร์มีปัญหา กรุณาลองใหม่อีกครั้งภายหลัง",
  /** The request never reached the API. */
  loginNetworkFailed:
    "เข้าสู่ระบบไม่สำเร็จ: เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบการเชื่อมต่อ",
  /** Any other non-2xx. */
  loginFailed: "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",

  // --- coordinator approval ---
  coordinatorApproved: "อนุมัติและบันทึกข้อมูลผู้ประสานงานเรียบร้อยแล้ว",

  // --- coordinator edit ---
  coordinatorUpdated: "แก้ไขข้อมูลผู้ประสานงานสำเร็จ",
  /** Leads every failure toast for the edit form, whatever the cause. */
  coordinatorUpdatePrefix: "แก้ไขข้อมูลผู้ประสานงานไม่สำเร็จ",
  coordinatorUpdateFailed:
    "แก้ไขข้อมูลผู้ประสานงานไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
  coordinatorUpdateNetworkFailed:
    "แก้ไขข้อมูลผู้ประสานงานไม่สำเร็จ: เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบการเชื่อมต่อ",
  coordinatorUpdateNotFound:
    "แก้ไขข้อมูลผู้ประสานงานไม่สำเร็จ: ไม่พบรายการนี้แล้ว กรุณากดรีเฟรช",
  coordinatorUpdateDbFailed:
    "แก้ไขข้อมูลผู้ประสานงานไม่สำเร็จ: ฐานข้อมูลมีปัญหา กรุณาลองใหม่อีกครั้ง",
  coordinatorDeclined: "ลบข้อมูลผู้ประสานงานออกจากรายการรออนุมัติแล้ว",
  coordinatorDeclineFailed: "ลบข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",

  // --- company unlink ---
  companyUnlinked: "ยกเลิกการผูกบริษัทกับกลุ่มไลน์นี้แล้ว",
  companyUnlinkPrefix: "ยกเลิกการผูกบริษัทไม่สำเร็จ",
  companyAlreadyUnlinked: "กลุ่มนี้ยังไม่ได้ผูกบริษัท ไม่มีอะไรต้องยกเลิก",

  // --- company aliases ---
  /** Fired when a blank alias box is still open at save time. */
  requireAlias: "กรุณาใส่ชื่อย่อบริษัท",
  aliasLimitReached: `เพิ่มชื่อย่อบริษัทได้มากที่สุด ${MAX_ALIASES} ชื่อ`,

  // --- company contacts ---
  contactCreated: "เพิ่มผู้ติดต่อเรียบร้อยแล้ว",
  contactUpdated: "แก้ไขข้อมูลผู้ติดต่อเรียบร้อยแล้ว",
  contactDeleted: "ลบผู้ติดต่อแล้ว",
  contactCreatePrefix: "เพิ่มผู้ติดต่อไม่สำเร็จ",
  contactUpdatePrefix: "แก้ไขข้อมูลผู้ติดต่อไม่สำเร็จ",
  contactDeletePrefix: "ลบผู้ติดต่อไม่สำเร็จ",
  /** Caught in the form, before the request goes out. */
  requireContactName: "กรุณากรอกชื่อผู้ติดต่อ",
  requireContactRole: "กรุณาเลือกความเกี่ยวข้องของผู้ติดต่อ",
  /** The manage button is only offered on a linked group, but state can drift. */
  contactNeedsCompany:
    "ต้องผูกกลุ่มนี้กับบริษัทก่อน จึงจะเพิ่มผู้ติดต่อได้",

  // --- update logs ---
  updateLogsPrefix: "โหลดประวัติการอัปเดตข้อมูลไม่สำเร็จ",
  updateLogsEmpty: "ยังไม่มีประวัติการอัปเดตข้อมูล",

  // --- notes ---
  noteCreated: "บันทึกโน้ตใหม่เรียบร้อยแล้ว",
  noteUpdated: "แก้ไขโน้ตเรียบร้อยแล้ว",
  noteDeleted: "ลบโน้ตแล้ว",
  noteCreatePrefix: "บันทึกโน้ตไม่สำเร็จ",
  noteUpdatePrefix: "แก้ไขโน้ตไม่สำเร็จ",
  noteDeletePrefix: "ลบโน้ตไม่สำเร็จ",

  // --- profile ---
  profileUpdated: "บันทึกชื่อเรียบร้อยแล้ว",
  profileUpdatePrefix: "บันทึกชื่อไม่สำเร็จ",
  /** users.display_name is nullable, so a fresh account genuinely has none. */
  noDisplayName: "ยังไม่มีชื่อ",

  editCancelled: "ยกเลิกการแก้ไข ข้อมูลกลับเป็นค่าเดิม",
  noCompanyName: "<ไม่มีชื่อบริษัท>",
  /** line_groups.display_name is nullable, so a group may genuinely have none. */
  noGroupName: "<ไม่มีชื่อกลุ่ม>",
} as const;
