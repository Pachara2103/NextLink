/**
 * Canonical values used by the MOU status column in the source sheet.
 *
 * Keep this list separate from the mock rows so an importer can expose a
 * status even when no company currently has that value. Unknown values from
 * a future sheet are still preserved by the UI with a neutral tone.
 */
export const MOU_DOCUMENT_STATUSES = [
  "แก้ไขที่นิติกรจุฬาฯ",
  "นิติกรบริษัท",
  "มอบอำนาจ",
  "รอลงนาม",
  "ลงนามแล้ว",
  "ลงนามกับมหาวิทยาลัย",
  "ลงนามแล้ว (บ.ในเครือ)",
  "หน่วยงานจุฬาฯ",
  "ปฏิเสธการลงนาม",
  "ยังไม่ได้ลงนาม",
] as const;

export type MouDocumentStatus = (typeof MOU_DOCUMENT_STATUSES)[number];
/** A known sheet value, or a newly introduced value preserved from the source. */
export type MouDocumentStatusValue = MouDocumentStatus | (string & {});
export type MouStatusTone = "green" | "blue" | "purple" | "orange" | "red" | "neutral";

export const MOU_STATUS_TONE: Record<MouDocumentStatus, MouStatusTone> = {
  "แก้ไขที่นิติกรจุฬาฯ": "purple",
  "นิติกรบริษัท": "orange",
  "มอบอำนาจ": "blue",
  "รอลงนาม": "blue",
  "ลงนามแล้ว": "green",
  "ลงนามกับมหาวิทยาลัย": "green",
  "ลงนามแล้ว (บ.ในเครือ)": "green",
  "หน่วยงานจุฬาฯ": "green",
  "ปฏิเสธการลงนาม": "red",
  "ยังไม่ได้ลงนาม": "red",
};

export const MOU_SIGNED_STATUSES = new Set<string>([
  "ลงนามแล้ว",
  "ลงนามกับมหาวิทยาลัย",
  "ลงนามแล้ว (บ.ในเครือ)",
  "หน่วยงานจุฬาฯ",
]);

/** Keep the dropdown in the same order as the source sheet. */
export function sortMouStatuses(statuses: Iterable<string>) {
  const order = new Map<string, number>(MOU_DOCUMENT_STATUSES.map((status, index) => [status, index]));
  return [...new Set(statuses)].sort((left, right) => {
    const leftOrder = order.get(left) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = order.get(right) ?? Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder || left.localeCompare(right, "th");
  });
}
