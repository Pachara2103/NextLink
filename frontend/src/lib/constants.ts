import type {
  ContactPersonStatus,
  ContactRole,
  EmployeeStatus,
  EmployeeUpdate,
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
  general: "ทั่วไป"
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
  transferred: "ย้ายบริษัท",
  inactive: "ติดต่อไม่ได้",
} as const satisfies Record<ContactPersonStatus, string>;

export const CONTACT_STATUS_OPTIONS: {
  value: ContactPersonStatus;
  label: string;
}[] = (Object.keys(CONTACT_STATUS_LABELS) as ContactPersonStatus[]).map(
  (value) => ({ value, label: CONTACT_STATUS_LABELS[value] }),
);

/**
 * `employees.status` for a person who has been reviewed, with the label each
 * value reads as. `pending` is deliberately absent: it is not a state anyone
 * picks, it is the state a row arrives in, and the only ways out of it are the
 * approve button and the delete button.
 */
export const EMPLOYEE_STATUS_LABELS = {
  active: "ยังทำงานอยู่",
  resigned: "ลาออกแล้ว",
  transferred: "ย้ายบริษัท",
  inactive: "ติดต่อไม่ได้",
} as const satisfies Record<EmployeeStatus, string>;

export const EMPLOYEE_STATUS_OPTIONS: {
  value: EmployeeStatus;
  label: string;
}[] = (Object.keys(EMPLOYEE_STATUS_LABELS) as EmployeeStatus[]).map(
  (value) => ({ value, label: EMPLOYEE_STATUS_LABELS[value] }),
);

/** How each reviewed status reads on a card: its badge tone and whether it dims the row. */
export const EMPLOYEE_STATUS_TONES = {
  active: "matched",
  resigned: "unmatched",
  transferred: "neutral",
  inactive: "muted",
} as const satisfies Record<EmployeeStatus, string>;

/**
 * `employees.job_title` is free text — the extraction pass writes whatever the
 * chat said — but three titles come up often enough to be worth offering
 * rather than retyping.
 *
 * Labelled in English, unlike `relevant` and `contacts.role`: a job title is
 * what goes on a business card, and the free-text titles this column already
 * holds ("Software Engineer", "HR Manager") are English too — a Thai label
 * beside them would make the three presets look like a different kind of
 * value than the rest of the column.
 */
export const JOB_TITLE_LABELS = {
  executive: "Executive",
  coordinator: "Coordinator",
  senior: "Senior",
} as const;

export type JobTitlePreset = keyof typeof JOB_TITLE_LABELS;

export const JOB_TITLE_PRESETS = Object.keys(
  JOB_TITLE_LABELS,
) as JobTitlePreset[];

export const JOB_TITLE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "— เลือกตำแหน่ง —" },
  ...JOB_TITLE_PRESETS.map((value) => ({
    value,
    label: JOB_TITLE_LABELS[value],
  })),
];

/**
 * The one declaration of the employee's editable fields: their names, their
 * order, and their labels. `EMPLOYEE_FIELDS` and `EmployeeField` are
 * derived from it, so adding a field here is the whole change — the form, the
 * summary grid and the draft type all follow.
 */
export const EMPLOYEE_FIELD_LABELS = {
  nameTh: "ชื่อผู้ประสานงาน (TH)",
  nameEn: "ชื่อผู้ประสานงาน (EN)",
  // Two to a row in both forms, so the pairs are chosen rather than fallen
  // into: the two names, then who they are to us, then the two ways to reach
  // them — which also keeps the two mono fields side by side.
  nickname: "ชื่อเล่น",
  relevant: "กิจกรรมที่เกี่ยวข้อง",
  phone: "เบอร์โทร",
  email: "อีเมล",
  // Last on purpose. It is the one field with two inputs behind it, so on the
  // review form it takes a full-width row of its own — and a full-width row in
  // the middle of a two-column grid leaves the cell beside its neighbour
  // empty. Putting it at the end leaves the six above it as three clean rows.
  jobTitle: "ตำแหน่ง",
} as const satisfies Record<string, string>;

export type EmployeeField = keyof typeof EMPLOYEE_FIELD_LABELS;

/** Field order drives both the summary list and the two-column form. */
export const EMPLOYEE_FIELDS = Object.keys(
  EMPLOYEE_FIELD_LABELS,
) as EmployeeField[];

/**
 * Fails to compile if a field above stops existing on the PUT body — which is
 * how a rename in backend/schemas/ reaches this file instead of turning into a
 * silent 422 at runtime.
 */
type _FieldsExistOnApi = EmployeeField extends keyof EmployeeUpdate
  ? true
  : never;
const _fieldsExistOnApi: _FieldsExistOnApi = true;
void _fieldsExistOnApi;

/** Form state: every field is a string, because an empty input is "" not null. */
export type EmployeeDraft = Record<EmployeeField, string>;

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
  // ── สถานะการเชื่อมต่อกับ backend (store/console-store.tsx) ──────────────
  /** แบนเนอร์ตอนเรียก API ไม่ถึง หรือ backend ตอบ 503 เพราะยัง start ไม่เสร็จ */
  serverDownTitle: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้",
  serverDownDetail:
    "กำลังลองเชื่อมต่อใหม่อัตโนมัติทุก 2 วินาที ข้อมูลบนหน้าจอตอนนี้อาจไม่ตรงกับฐานข้อมูล จึงปิดการบันทึกไว้ชั่วคราว",
  /** กดปุ่มที่เขียนข้อมูลระหว่างที่ยังติดต่อไม่ได้ */
  serverDownBlocked:
    "ยังเชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณารอจนกลับมาเชื่อมต่อได้แล้วลองใหม่",
  /** กลับมาติดต่อได้ เป็น process เดิม */
  serverBack: "เชื่อมต่อเซิร์ฟเวอร์ได้แล้ว กำลังโหลดข้อมูลใหม่",
  /** กลับมาติดต่อได้ แต่เป็น process ใหม่ (เช่น dev server รีสตาร์ต) */
  serverRestarted: "เซิร์ฟเวอร์เริ่มระบบใหม่ กำลังโหลดข้อมูลทั้งหมดอีกครั้ง",

  requireEmployeeName: "กรุณากรอกชื่อผู้ประสานงาน (อย่างน้อยหนึ่งภาษา)",
  requireCompanyName: "กรุณากรอกหรือเลือกชื่อบริษัท",
  employeeSaveFailed: "เกิดข้อผิดพลาดในการบันทึกข้อมูล กรุณาลองใหม่อีกครั้ง",
  companySaveFailed: "เกิดข้อผิดพลาดในการเพิ่มชื่อบริษัท กรุณาลองใหม่อีกครั้ง",

  /**
   * What each toast leads with when the API sent a reason of its own. The
   * backend names the cause ("ไม่พบบริษัทของกลุ่มนี้ในฐานข้อมูล"); only the
   * console knows which action the user was taking when it happened.
   */
  syncPrefix: "โหลดข้อมูลไม่สำเร็จ",
  employeePrefix: "บันทึกข้อมูลผู้ประสานงานไม่สำเร็จ",
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
  employeeGroupNotMatched:
    "บันทึกข้อมูลไม่สำเร็จ: ไม่พบบริษัทของกลุ่มนี้ในฐานข้อมูล กรุณาเพิ่มชื่อบริษัทก่อน",
  /** API answered 5xx: the Neo4j write itself failed. */
  employeeDbFailed:
    "บันทึกข้อมูลไม่สำเร็จ: ฐานข้อมูลมีปัญหา กรุณาลองใหม่อีกครั้ง",
  /** Never reached the API at all (network down, dev server not running). */
  employeeNetworkFailed:
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

  // --- employee approval ---
  employeeApproved: "อนุมัติและบันทึกข้อมูลผู้ประสานงานเรียบร้อยแล้ว",

  // --- employee create (ผู้ติดต่อและบุคคลในบริษัท) ---
  employeeCreated: "เพิ่มบุคคลในบริษัทเรียบร้อยแล้ว",
  employeeCreatePrefix: "เพิ่มบุคคลในบริษัทไม่สำเร็จ",
  employeeCreateFailed: "เพิ่มบุคคลในบริษัทไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
  employeeCreateNetworkFailed:
    "เพิ่มบุคคลในบริษัทไม่สำเร็จ: เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบการเชื่อมต่อ",
  employeeCreateNoCompany:
    "เพิ่มบุคคลในบริษัทไม่สำเร็จ: ไม่พบบริษัทนี้ในฐานข้อมูลกราฟ กรุณาผูกบริษัทกับกลุ่มไลน์นี้อีกครั้ง",
  employeeCreateDbFailed:
    "เพิ่มบุคคลในบริษัทไม่สำเร็จ: ฐานข้อมูลมีปัญหา กรุณาลองใหม่อีกครั้ง",

  // --- employee delete (ผู้ติดต่อและบุคคลในบริษัท) ---
  employeeDeleted: "ลบบุคคลในบริษัทเรียบร้อยแล้ว",
  /** Caught in the form, before the request goes out. */
  requireEmployeeCompany: "ไม่พบบริษัทของกลุ่มไลน์นี้ กรุณาผูกบริษัทก่อน",

  // --- employee edit ---
  employeeUpdated: "แก้ไขข้อมูลผู้ประสานงานสำเร็จ",
  /** Leads every failure toast for the edit form, whatever the cause. */
  employeeUpdatePrefix: "แก้ไขข้อมูลผู้ประสานงานไม่สำเร็จ",
  employeeUpdateFailed:
    "แก้ไขข้อมูลผู้ประสานงานไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
  employeeUpdateNetworkFailed:
    "แก้ไขข้อมูลผู้ประสานงานไม่สำเร็จ: เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบการเชื่อมต่อ",
  employeeUpdateNotFound:
    "แก้ไขข้อมูลผู้ประสานงานไม่สำเร็จ: ไม่พบรายการนี้แล้ว กรุณากดรีเฟรช",
  employeeUpdateDbFailed:
    "แก้ไขข้อมูลผู้ประสานงานไม่สำเร็จ: ฐานข้อมูลมีปัญหา กรุณาลองใหม่อีกครั้ง",
  employeeDeclined: "ลบข้อมูลผู้ประสานงานออกจากรายการรออนุมัติแล้ว",
  employeeDeclineFailed: "ลบข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
  /** The add form is only offered on a linked group, but state can drift. */
  employeeNeedsCompany:
    "ต้องผูกกลุ่มนี้กับบริษัทก่อน จึงจะเพิ่มบุคคลในบริษัทได้",

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
