"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";

import { MESSAGES } from "@/lib/constants";
import type {
  Company,
  CompanyInput,
  Contact,
  ContactCreate,
  ContactStatus,
  ContactUpdate,
  Employee,
  EmployeeCreate,
  EmployeeUpdate,
  GroupLine,
  Note,
  NoteInput,
  PanelKey,
  SyncScope,
  Toast,
  ToastItem,
} from "@/types";

import { companyService } from "@/lib/services/company";
import { healthService, type HealthInfo } from "@/lib/services/health";
import { contactService } from "@/lib/services/contact";
import { employeeService } from "@/lib/services/employee";
import { lineService } from "@/lib/services/line";
import { noteService } from "@/lib/services/note";
import { isNetworkError, serverDetail } from "@/lib/services/errors";
import { ApiError, setUnreachableHandler } from "@/lib/services/http";
import { refreshUpdateLogs } from "@/lib/update-logs";

/**
 * Client-side replacement for the Streamlit st.session_state. Every "index" key
 * in the original held a single value, so at most one group is expanded, one
 * contact is in edit mode, and one company form is open at a time. That is kept
 * deliberately, with one fix: the open company form is scoped to a panel, so
 * switching panels no longer tears down what the other one had open.
 */

interface State {
  groupLines: GroupLine[];
  /** The company directory, for the "ค้นหาบริษัทที่มีอยู่" mode. */
  companies: Company[];
  /**
   * The extracted and hand-added staff, keyed by **company** id — not group id.
   * `employees.company_id` is the FK the table carries, so a LINE group reaches
   * its people through the company row it points at, and a group with no
   * company simply has none.
   */
  employees: Record<number, Employee[]>;
  /**
   * Company contacts, keyed by **company** id — not group id. A contact belongs
   * to the company, so unlinking a group and binding it to another one must not
   * carry the old company's people across.
   */
  companyContacts: Record<number, Contact[]>;
  notes: Note[];
  syncing: null | SyncScope;
  lastSyncedAt: string | null;
  /**
   * True from the moment a request fails to reach the API until /health
   * answers again.
   *
   * It is not decoration. While it is true the data on screen is of unknown
   * age — a write may have been cut off halfway, which is exactly what a
   * backend restart in the middle of a click does — so writes are refused and
   * everything is re-read the moment the server comes back.
   */
  serverDown: boolean;
  /** The backend process the data on screen came from. See services/health.ts. */
  bootId: string | null;
  viewingGroupId: string | null;
  editingContactId: number | null;
  editingCompany: { scope: PanelKey; groupId: string } | null;
  /**
   * Oldest first. ToastHost lays the column out bottom-up, so the newest toast
   * sits on top of the pile in the corner and the older ones stay beneath it.
   */
  toasts: ToastItem[];
}

/** How many toasts may share the corner before the oldest is pushed out. */
const MAX_TOASTS = 4;

/**
 * The id exists only to key the list and to hang each toast's own dismiss
 * timer off it — nothing reads it back — so a module counter is enough.
 */
let toastSeq = 0;

function pushToast(state: State, toast: Toast): State {
  const next = [...state.toasts, { ...toast, id: ++toastSeq }];
  return { ...state, toasts: next.slice(-MAX_TOASTS) };
}

type Action =
  | { type: "sync/start"; scope: SyncScope }
  | {
      type: "sync/done";
      scope: SyncScope;
      groups: GroupLine[];
      companies: Company[];
      employees: Record<number, Employee[]>;
      companyContacts: Record<number, Contact[]>;
      at: string;
    }
  | { type: "notes/set"; notes: Note[] }
  | { type: "company-contacts/set"; contacts: Record<number, Contact[]> }
  | { type: "employees/set"; employees: Record<number, Employee[]> }
  | { type: "view/toggle"; groupId: string }
  | { type: "contact/edit"; contactId: number }
  | { type: "contact/edit-cancel" }
  | {
      type: "contact/save";
      companyId: number;
      contactId: number;
      patch: EmployeeUpdate;
      at: string;
      /** Quiet on the directory page, which raises its own toast. */
      silent?: boolean;
    }
  | { type: "contact/confirm"; companyId: number; contactId: number; at: string }
  | { type: "contact/delete"; companyId: number; contactId: number }
  | { type: "company/open"; scope: PanelKey; groupId: string }
  | { type: "company/close" }
  | {
      type: "company/save";
      groupId: string;
      input: CompanyInput;
      at: string;
      /**
       * The id of the row the write left behind. A rename already knew it; a
       * create only learns it from the read that follows, and until the group
       * carries it "จัดการผู้ติดต่อ" has nothing to open.
       */
      companyId?: number | null;
      /** The re-read directory, when the create refreshed it. */
      companies?: Company[];
    }
  | { type: "company/unlinked"; groupId: string }
  | { type: "sync/failed"; message: string }
  | { type: "server/down" }
  | { type: "server/up"; bootId: string }
  | { type: "toast/set"; toast: Toast }
  | { type: "toast/dismiss"; id: number }
  | { type: "toast/clear" };

// Both reads are async now, so the console starts empty and the provider
// kicks off the initial sync on mount.
function initialState(): State {
  return {
    groupLines: [],
    companies: [],
    employees: {},
    companyContacts: {},
    notes: [],
    syncing: "initial",
    lastSyncedAt: null,
    serverDown: false,
    bootId: null,
    viewingGroupId: null,
    editingContactId: null,
    editingCompany: null,
    toasts: [],
  };
}

function mapEmployees(
  employees: Record<number, Employee[]>,
  companyId: number,
  contactId: number,
  update: (person: Employee) => Employee,
): Record<number, Employee[]> {
  const list = employees[companyId];
  if (!list) return employees;
  return {
    ...employees,
    [companyId]: list.map((person) =>
      person.id === contactId ? update(person) : person,
    ),
  };
}

function dropEmployee(
  employees: Record<number, Employee[]>,
  companyId: number,
  contactId: number,
): Record<number, Employee[]> {
  const list = employees[companyId];
  if (!list) return employees;
  return {
    ...employees,
    [companyId]: list.filter((person) => person.id !== contactId),
  };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "sync/start":
      return { ...state, syncing: action.scope };

    // Same object back when nothing changed: every failed health poll reports
    // "still down", and a new state object each time would re-render the whole
    // console twice a second for as long as the backend is away.
    case "server/down":
      return state.serverDown ? state : { ...state, serverDown: true };

    case "server/up":
      return state.serverDown === false && state.bootId === action.bootId
        ? state
        : { ...state, serverDown: false, bootId: action.bootId };

    // A sync closes everything that was open, exactly like the original reruns.
    case "sync/done":
      return {
        ...state,
        syncing: null,
        lastSyncedAt: action.at,

        // A "groups" refresh reads no employees, so it must not wipe the
        // ones already on screen. Everything else always overwrites, because
        // every scope re-reads the groups and the company directory.
        groupLines: action.groups,
        companies: action.companies,
        employees:
          action.scope === "groups" ? state.employees : action.employees,
        // Every scope re-reads these: they are one cheap list, and they are
        // what the badges on the group cards are drawn from.
        companyContacts: action.companyContacts,

        viewingGroupId: null,
        editingContactId: null,
        editingCompany: null,
      };

    case "view/toggle":
      return {
        ...state,
        viewingGroupId:
          state.viewingGroupId === action.groupId ? null : action.groupId,
        editingContactId: null,
      };

    case "contact/edit":
      return { ...state, editingContactId: action.contactId };

    // No toast. Closing a form nobody submitted is not news — the dialog
    // disappearing already says it, and a success-green notice for "nothing
    // happened" only trains the eye to ignore the corner the real ones
    // arrive in.
    case "contact/edit-cancel":
      return { ...state, editingContactId: null };

    /**
     * The row as the write left it. `updatedAt` is set here too, because both
     * endpoints stamp `updated_at = now()` — and on the directory page that
     * column is the sort key, so a saved card that kept its old timestamp
     * would stay where it was instead of moving to the top of its list.
     */
    case "contact/save": {
      const next: State = {
        ...state,
        editingContactId: null,
        employees: mapEmployees(
          state.employees,
          action.companyId,
          action.contactId,
          (person) => ({ ...person, ...action.patch, updatedAt: action.at }),
        ),
      };
      return action.silent
        ? next
        : pushToast(next, {
            kind: "success",
            message: MESSAGES.employeeUpdated,
          });
    }

    // Approval writes `active`, not `approved`: the status column carries
    // where the person stands at the company, and "a human has looked at
    // this" is not one of those places — it is the absence of `pending`.
    case "contact/confirm":
      return pushToast(
        {
          ...state,
          employees: mapEmployees(
            state.employees,
            action.companyId,
            action.contactId,
            (person) => ({
              ...person,
              status: "active",
              updatedAt: action.at,
            }),
          ),
        },
        { kind: "success", message: MESSAGES.employeeApproved },
      );

    // A decline really is a delete now — there is no `declined` status for the
    // row to sit in — so the row leaves local state rather than changing
    // colour in it. Same case serves the directory page's delete button.
    case "contact/delete":
      return {
        ...state,
        editingContactId: null,
        employees: dropEmployee(
          state.employees,
          action.companyId,
          action.contactId,
        ),
      };

    case "company/open":
      // The form is a dialog now, so it no longer takes the card's body over —
      // and an expanded employee list underneath it is exactly what the
      // reviewer was looking at, so it stays expanded.
      return {
        ...state,
        editingCompany: { scope: action.scope, groupId: action.groupId },
      };

    case "company/close":
      return { ...state, editingCompany: null };

    // A blank field does not overwrite an existing name, matching the coalesce
    // in the UPDATE and the Cypher MERGE. isLinked goes true either way: both
    // endpoints are only ever reached by a human confirming the company.
    case "company/save":
      return {
        ...state,
        editingCompany: null,
        groupLines: state.groupLines.map((group) =>
          group.groupId === action.groupId
            ? {
                ...group,
                // A create only gets its id from the read that follows it, and
                // ManageContactsButton renders nothing without one — which is
                // why binding a company used to need a page reload before
                // "จัดการผู้ติดต่อ" appeared.
                companyId: action.companyId ?? group.companyId,
                companyTh: action.input.companyTh ?? group.companyTh,
                companyEn: action.input.companyEn ?? group.companyEn,
                // Unlike the two names, the alias list is always sent whole —
                // the form shows all of them, so all of them are what gets
                // stored, and an empty array is how the last one is removed.
                // Mirroring that here is what makes re-opening the form show
                // the aliases that were just saved rather than the old ones.
                aliases: action.input.aliases ?? group.aliases,
                isLinked: true,
                updatedAt: action.at,
              }
            : group,
        ),
        // The directory feeds the note form's company picker, which searches
        // aliases — so it has to hear about the rename too. A create re-reads
        // the whole list instead: the row is new, so there is nothing here to
        // patch.
        companies:
          action.companies ??
          state.companies.map((company) =>
            company.groupId === action.groupId
              ? {
                  ...company,
                  companyTh: action.input.companyTh ?? company.companyTh,
                  companyEn: action.input.companyEn ?? company.companyEn,
                  aliases: action.input.aliases ?? company.aliases,
                  isLinked: true,
                  updatedAt: action.at,
                }
              : company,
          ),
      };

    case "notes/set":
      return { ...state, notes: action.notes };

    case "company-contacts/set":
      return { ...state, companyContacts: action.contacts };

    case "employees/set":
      return { ...state, employees: action.employees, editingContactId: null };

    // The company row is gone, so the group is back to unlinked with no
    // company names and nothing to point at.
    case "company/unlinked":
      return {
        ...state,
        editingCompany: null,
        groupLines: state.groupLines.map((group) =>
          group.groupId === action.groupId
            ? {
                ...group,
                companyTh: null,
                companyEn: null,
                aliases: [],
                companyId: null,
                isLinked: false,
              }
            : group,
        ),
        companies: state.companies.filter((c) => c.groupId !== action.groupId),
      };

    case "sync/failed":
      return pushToast(
        { ...state, syncing: null },
        { kind: "error", message: action.message },
      );

    case "toast/set":
      return pushToast(state, action.toast);

    case "toast/dismiss":
      return {
        ...state,
        toasts: state.toasts.filter((toast) => toast.id !== action.id),
      };

    case "toast/clear":
      return { ...state, toasts: [] };

    default:
      return state;
  }
}

interface Store extends State {
  /** Groups whose company row a human has confirmed (companies.is_linked). */
  linkedGroups: GroupLine[];
  unlinkedGroups: GroupLine[];
  pendingCount: number;
  /** Everyone who has been reviewed — the people the directory page lists. */
  staffCount: number;
  /** One count per employees.status. */
  statusCounts: Record<ContactStatus, number>;
  /** This company's people, newest first. `null` company id gives an empty list. */
  employeesOf: (companyId: number | null | undefined) => Employee[];
  isCompanyFormOpen: (scope: PanelKey, groupId: string) => boolean;
  sync: (scope: SyncScope) => Promise<void>;
  /** Re-reads the employee list alone, after a write that the store cannot patch. */
  reloadEmployees: () => Promise<void>;
  toggleView: (groupId: string) => void;
  startContactEdit: (contactId: number) => void;
  cancelContactEdit: () => void;
  /**
   * Writes the edited fields of a **pending** row. PostgreSQL only: the row
   * has no graph node yet, so there is nothing there to keep in step.
   *
   * Resolves true only when the row really changed; on failure nothing is
   * touched locally and the form stays open on the values the user typed, so
   * the save can be retried.
   */
  saveContact: (
    companyId: number,
    contactId: number,
    patch: EmployeeUpdate,
  ) => Promise<boolean>;
  /**
   * Writes the edited fields of a **reviewed** row, through the endpoint that
   * updates PostgreSQL and Neo4j under one transaction. This is what the
   * directory page's edit form saves with — the pg-only write above would
   * leave the graph holding the old name.
   */
  saveEmployee: (
    companyId: number,
    contactId: number,
    patch: EmployeeUpdate,
  ) => Promise<boolean>;
  /** Adds one person by hand. Writes both halves. True only on success. */
  createEmployee: (payload: EmployeeCreate) => Promise<boolean>;
  /** Approves one extracted employee: status becomes `active` and the graph gains the node. */
  confirmContact: (companyId: number, contactId: number) => Promise<void>;
  /** Declines one extracted employee — deletes the pending row, graph untouched. */
  declineContact: (companyId: number, contactId: number) => Promise<void>;
  /** Deletes one reviewed employee from both halves. True only on success. */
  deleteEmployee: (companyId: number, contactId: number) => Promise<boolean>;
  openCompanyForm: (scope: PanelKey, groupId: string) => void;
  closeCompanyForm: () => void;
  /**
   * Binds a group to a company, or renames the one it already points at. One
   * action for both, because which of the two happens is not the caller's
   * decision — it follows from whether the group already has a company row.
   * True only on success.
   */
  saveCompany: (group: GroupLine, input: CompanyInput) => Promise<boolean>;
  /** Unlink: deletes the company row the group points at. True only on success. */
  unlinkCompany: (group: GroupLine) => Promise<boolean>;
  /**
   * Creates or edits one company contact. `id === null` creates. True only on
   * success; on failure the store has already raised the toast and the form
   * stays open on what the user typed.
   */
  saveCompanyContact: (
    companyId: number,
    id: number | null,
    input: ContactCreate | ContactUpdate,
  ) => Promise<boolean>;
  /** Deletes one company contact. True only on success. */
  deleteCompanyContact: (companyId: number, id: number) => Promise<boolean>;
  /** Re-reads the notes list. Every note write is followed by one of these. */
  reloadNotes: () => Promise<void>;
  saveNote: (id: number | null, input: NoteInput) => Promise<boolean>;
  deleteNote: (id: number) => Promise<boolean>;
  notify: (toast: Toast) => void;
  /** Removes one toast from the stack — the X, and the auto-dismiss timer. */
  dismissToast: (id: number) => void;
  /** Clears the whole stack at once. */
  clearToasts: () => void;
}

/**
 * Every toast below follows the same three steps, because the backend now
 * raises core.exceptions.AppException and its message is written for this
 * screen: no answer at all is a network problem we name ourselves, an answer
 * carrying a detail gets that detail shown verbatim under our own prefix, and
 * only an answer with nothing usable in it falls back to the status code.
 */
function syncErrorMessage(error: unknown): string {
  if (isNetworkError(error)) return MESSAGES.syncNetworkFailed;

  const detail = serverDetail(error);
  if (detail) return `${MESSAGES.syncPrefix}: ${detail}`;

  const { status } = error as ApiError;
  if (status >= 500) return MESSAGES.syncServerFailed;
  if (status === 404) return MESSAGES.syncNotFound;
  return MESSAGES.syncFailed;
}

function employeeErrorMessage(error: unknown): string {
  if (isNetworkError(error)) return MESSAGES.employeeNetworkFailed;

  const detail = serverDetail(error);
  if (detail) return `${MESSAGES.employeePrefix}: ${detail}`;

  const { status } = error as ApiError;
  if (status === 404) return MESSAGES.employeeGroupNotMatched;
  if (status >= 500) return MESSAGES.employeeDbFailed;
  return MESSAGES.employeeSaveFailed;
}

function employeeUpdateErrorMessage(error: unknown): string {
  if (isNetworkError(error)) return MESSAGES.employeeUpdateNetworkFailed;

  const detail = serverDetail(error);
  if (detail) return `${MESSAGES.employeeUpdatePrefix}: ${detail}`;

  const { status } = error as ApiError;
  if (status === 404) return MESSAGES.employeeUpdateNotFound;
  if (status >= 500) return MESSAGES.employeeUpdateDbFailed;
  return MESSAGES.employeeUpdateFailed;
}

function employeeCreateErrorMessage(error: unknown): string {
  if (isNetworkError(error)) return MESSAGES.employeeCreateNetworkFailed;

  const detail = serverDetail(error);
  if (detail) return `${MESSAGES.employeeCreatePrefix}: ${detail}`;

  const { status } = error as ApiError;
  // 404 here is the Company node, not the row: the graph MERGE matches on it,
  // so a company that exists in Postgres but not in Neo4j fails exactly this
  // way — and the fix is to bind the company again, not to retry.
  if (status === 404) return MESSAGES.employeeCreateNoCompany;
  if (status === 400 || status === 422) return MESSAGES.requireEmployeeName;
  if (status >= 500) return MESSAGES.employeeCreateDbFailed;
  return MESSAGES.employeeCreateFailed;
}

function declineErrorMessage(error: unknown): string {
  if (isNetworkError(error)) return MESSAGES.employeeNetworkFailed;

  const detail = serverDetail(error);
  if (detail) return `${MESSAGES.declinePrefix}: ${detail}`;

  return (error as ApiError).status >= 500
    ? MESSAGES.employeeDbFailed
    : MESSAGES.employeeDeclineFailed;
}

function companyErrorMessage(error: unknown): string {
  if (isNetworkError(error)) return MESSAGES.companyNetworkFailed;

  const detail = serverDetail(error);
  if (detail) return `${MESSAGES.companyPrefix}: ${detail}`;

  const { status } = error as ApiError;
  if (status === 400 || status === 422) return MESSAGES.requireCompanyName;
  if (status >= 500) return MESSAGES.companyDbFailed;
  return MESSAGES.companySaveFailed;
}

function contactErrorMessage(error: unknown, prefix: string): string {
  if (isNetworkError(error))
    return `${prefix}: เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบการเชื่อมต่อ`;

  const detail = serverDetail(error);
  if (detail) return `${prefix}: ${detail}`;

  const { status } = error as ApiError;
  if (status === 404) return `${prefix}: ไม่พบรายการนี้แล้ว กรุณากดรีเฟรช`;
  if (status >= 500) return `${prefix}: ฐานข้อมูลมีปัญหา กรุณาลองใหม่อีกครั้ง`;
  return `${prefix} กรุณาลองใหม่อีกครั้ง`;
}

function noteErrorMessage(error: unknown, prefix: string): string {
  if (isNetworkError(error)) return `${prefix}: เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบการเชื่อมต่อ`;

  const detail = serverDetail(error);
  if (detail) return `${prefix}: ${detail}`;

  const { status } = error as ApiError;
  if (status === 404) return `${prefix}: ไม่พบโน้ตนี้แล้ว กรุณากดรีเฟรช`;
  if (status >= 500) return `${prefix}: ฐานข้อมูลมีปัญหา กรุณาลองใหม่อีกครั้ง`;
  return `${prefix} กรุณาลองใหม่อีกครั้ง`;
}

const ConsoleContext = createContext<Store | null>(null);

export function ConsoleProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  // Monotonic ticket, so a slow "all" sync that lands after a later "groups"
  // sync cannot overwrite the fresher data.
  const requestId = useRef(0);

  const sync = useCallback(async (scope: SyncScope) => {
    const id = ++requestId.current;
    dispatch({ type: "sync/start", scope });
    try {
      let groups: GroupLine[] = [];
      let companies: Company[] = [];
      let employees: Record<number, Employee[]> = {};
      let companyContacts: Record<number, Contact[]> = {};
      let errorGroups: string[] = [];
      // ไม่ null เมื่อ POST /line/update-information ไม่ตอบกลับ ตัว sync ยังเดินต่อ
      // จนจบเพราะข้อมูลที่อ่านมาใหม่นั้นถูกต้องอยู่แล้ว - ดู lineService.updateInformation
      let updateNotConfirmed: unknown = null;

      if (scope === "all") {
        // Has to come first, and the group read has to come after it: the
        // extraction pass writes an unconfirmed company row for every group it
        // could name, so groupLines.companyId is stale until it has run — and
        // companyId is what decides create-vs-rename in saveCompany.
        const res = await lineService.updateInformation();
        employees = res.employees;
        errorGroups = res.errorGroups;
        updateNotConfirmed = res.postError;
        if (updateNotConfirmed) {
          console.error(
            "POST /line/update-information ไม่ตอบกลับ - ใช้ผลที่อ่านใหม่จาก DB แทน",
            updateNotConfirmed,
          );
        }
        // This press is what writes a new update_logs row, so the shared log
        // — and the "ซิงค์ล่าสุด" line reading its newest row — is one row
        // short until it is read again. Not awaited: the sync below does not
        // depend on it, and a failed re-read only leaves the old timestamp.
        void refreshUpdateLogs();
      }

      // In parallel: none of the three depends on the others.
      [groups, companies, companyContacts] = await Promise.all([
        lineService.getGroupLines(),
        companyService.list(),
        contactService.listByCompany(),
      ]);

      if (scope === "initial") {
        const [byCompany, notes] = await Promise.all([
          employeeService.getEmployeesByCompany(),
          noteService.list(),
        ]);
        employees = byCompany;
        dispatch({ type: "notes/set", notes });
      }

      if (id !== requestId.current) {
        // งานนี้ถูกแทนที่ด้วย sync ที่ใหม่กว่า ผลที่อ่านมาจึงถูกทิ้ง ไม่ใช่ error
        // แต่ต้องเห็นใน console: ถ้าเงียบ อาการจะเป็น "กดปุ่มแล้วไม่มีอะไรเกิดขึ้น"
        // แบบไม่มีร่องรอยให้ตาม ซึ่งเกิดง่ายตอน dev เพราะแก้ไฟล์ระหว่างที่ปุ่ม
        // อัปเดตข้อมูลยังทำงานอยู่ Fast Refresh จะ remount provider แล้วยิง
        // sync("initial") ทับ
        console.warn(
          `sync("${scope}") ถูกยกเลิก: มี sync ที่ใหม่กว่าเริ่มไปแล้ว`,
          { id, current: requestId.current },
        );
        return;
      }

      dispatch({
        type: "sync/done",
        scope,
        groups,
        companies,
        employees,
        companyContacts,
        at: new Date().toISOString(),
      });

      // ทั้งสองกรณีเป็น "ทำงานไปแล้วแต่ผลอาจไม่ครบ" ไม่ใช่ล้มเหลว - รายการที่
      // เพิ่ง dispatch ไปข้างบนคืออ่านสดจาก DB แล้ว จึงเตือนหลังจอเปลี่ยนแล้ว
      // ไม่ใช่แทนการเปลี่ยนจอ
      if (updateNotConfirmed) {
        dispatch({
          type: "toast/set",
          toast: { kind: "error", message: MESSAGES.updateNotConfirmed },
        });
      } else if (errorGroups.length > 0) {
        dispatch({
          type: "toast/set",
          toast: {
            kind: "error",
            message: `เกิดปัญหาในการสรุปข้อมูลกลุ่ม ${errorGroups.join(", ")}`,
          },
        });
      }
    } catch (error) {
      console.error("sync failed", error);
      if (id !== requestId.current) return;
      dispatch({ type: "sync/failed", message: syncErrorMessage(error) });
    }
  }, []);

  // First paint has nothing to show, so pull the group lines and whatever
  // employees are already stored. Only the LLM pass that produces new ones
  // stays behind the "อัปเดตข้อมูล" button.
  useEffect(() => {
    void sync("initial");
  }, [sync]);

  // ─────────────────────────────────────────────────────────────────────────
  // เซิร์ฟเวอร์หายไประหว่างทาง
  //
  // อาการที่ทำให้ต้องมีบล็อกนี้: กด "ลบข้อมูล" ตอน backend กำลัง restart
  // (uvicorn --reload) request ถูกตัดกลางคัน แต่จอยังถือข้อมูลชุดเดิมไว้
  // เหมือนไม่มีอะไรเกิดขึ้น พอเซิร์ฟเวอร์กลับมา สิ่งที่เห็นกับสิ่งที่อยู่ใน
  // ฐานข้อมูลจึงไม่ตรงกัน แล้วทุกอย่างที่กดต่อจากนั้นก็ผิดตาม ๆ กัน
  //
  // กติกาใหม่: คำสั่งที่ไปไม่ถึงเซิร์ฟเวอร์ = "ไม่รู้ผล" ไม่ใช่ "ไม่สำเร็จ"
  // จึงห้ามเดาว่าข้อมูลบนจอยังถูก - ต้องอ่านใหม่ทั้งหมดเมื่อกลับมาติดต่อได้
  // ─────────────────────────────────────────────────────────────────────────

  /** boot id ของ backend ตัวที่ข้อมูลบนจอมาจาก - ดู services/health.ts */
  const bootId = useRef<string | null>(null);

  useEffect(() => {
    setUnreachableHandler(() => dispatch({ type: "server/down" }));
    return () => setUnreachableHandler(null);
  }, []);

  // อ่าน boot id ตั้งต้นไว้เทียบทีหลัง ถ้าอ่านไม่ได้ก็ไม่ต้องทำอะไร -
  // ตัว handler ข้างบนขึ้นแบนเนอร์ให้แล้ว
  useEffect(() => {
    void healthService.read().then(
      (info) => {
        bootId.current = info.bootId;
        dispatch({ type: "server/up", bootId: info.bootId });
      },
      () => {},
    );
  }, []);

  useEffect(() => {
    if (!state.serverDown) return;

    let stopped = false;

    async function check() {
      let info: HealthInfo;
      try {
        info = await healthService.read();
      } catch {
        return; // ยังไม่กลับมา - รอรอบหน้า
      }
      // ตอบได้แล้วแต่ยังโหลดโมเดลไม่เสร็จ: request อื่นยังได้ 503 อยู่
      if (stopped || !info.ready) return;

      const restarted = bootId.current !== null && bootId.current !== info.bootId;
      bootId.current = info.bootId;
      dispatch({ type: "server/up", bootId: info.bootId });
      dispatch({
        type: "toast/set",
        toast: {
          kind: "success",
          message: restarted ? MESSAGES.serverRestarted : MESSAGES.serverBack,
        },
      });
      // อ่านใหม่ทั้งชุด ไม่ใช่แค่ปลดแบนเนอร์ - "initial" คืออ่านอย่างเดียว
      // ไม่มี LLM pass จึงเรียกได้โดยไม่มีค่าใช้จ่าย
      void sync("initial");
    }

    void check();
    const timer = setInterval(() => void check(), 2000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [state.serverDown, sync]);

  // Stable identities: each toast row keys its 3s auto-dismiss timer off
  // dismissToast, so it must not change on every unrelated state update or the
  // timer restarts (and never fires).
  const dismissToast = useCallback(
    (id: number) => dispatch({ type: "toast/dismiss", id }),
    [],
  );
  const clearToasts = useCallback(() => dispatch({ type: "toast/clear" }), []);

  /**
   * Re-reads `GET /employees` on its own.
   *
   * The create endpoint answers with a bare status, so the id and timestamps of
   * the row it inserted can only come from a read — there is nothing to patch
   * local state with. Cheap enough to be the whole refresh: one flat list, no
   * LLM pass, nothing behind the "อัปเดตข้อมูล" button.
   */
  const reloadEmployees = useCallback(async () => {
    try {
      dispatch({
        type: "employees/set",
        employees: await employeeService.getEmployeesByCompany(),
      });
    } catch (error) {
      console.error("reloadEmployees failed", error);
      dispatch({
        type: "toast/set",
        toast: { kind: "error", message: syncErrorMessage(error) },
      });
    }
  }, []);

  const value = useMemo<Store>(() => {
    const linkedGroups = state.groupLines.filter((g) => g.isLinked);
    const unlinkedGroups = state.groupLines.filter((g) => !g.isLinked);
    const everyone = Object.values(state.employees).flat();
    const statusCounts: Record<ContactStatus, number> = {
      pending: 0,
      active: 0,
      resigned: 0,
      transferred: 0,
      inactive: 0,
    };
    for (const person of everyone) statusCounts[person.status] += 1;

    /**
     * ปิดทางเขียนขณะที่ติดต่อเซิร์ฟเวอร์ไม่ได้
     *
     * ยิงไปตอนนี้ก็ได้แค่ค้างจนหมดเวลา แล้วจบลงที่ "ไม่รู้ว่าเขียนไปหรือยัง"
     * ซึ่งแย่กว่าไม่ได้เริ่ม - ปุ่มที่กดไม่ได้พร้อมเหตุผล อ่านง่ายกว่าปุ่มที่
     * กดแล้วหมุนเปล่า ๆ การอ่านยังปล่อยให้ทำได้ เพราะการอ่านคือทางกลับ
     */
    const refuseWhileDown = (): boolean => {
      if (!state.serverDown) return false;
      dispatch({
        type: "toast/set",
        toast: { kind: "error", message: MESSAGES.serverDownBlocked },
      });
      return true;
    };

    return {
      ...state,
      linkedGroups,
      unlinkedGroups,
      pendingCount: statusCounts.pending,
      staffCount: everyone.length - statusCounts.pending,
      statusCounts,
      employeesOf: (companyId) =>
        companyId === null || companyId === undefined
          ? []
          : (state.employees[companyId] ?? []),
      isCompanyFormOpen: (scope, groupId) =>
        state.editingCompany?.scope === scope &&
        state.editingCompany.groupId === groupId,
      sync,
      reloadEmployees,
      toggleView: (groupId) => dispatch({ type: "view/toggle", groupId }),
      startContactEdit: (contactId) =>
        dispatch({ type: "contact/edit", contactId }),
      cancelContactEdit: () => dispatch({ type: "contact/edit-cancel" }),

      saveContact: async (companyId, contactId, patch) => {
        if (refuseWhileDown()) return false;
        try {
          await employeeService.update(contactId, patch);
        } catch (error) {
          console.error("saveContact failed", error);
          dispatch({
            type: "toast/set",
            toast: {
              kind: "error",
              message: employeeUpdateErrorMessage(error),
            },
          });
          return false;
        }

        // Only now, so a row the API refused keeps the values it still has.
        dispatch({
          type: "contact/save",
          companyId,
          contactId,
          patch,
          at: new Date().toISOString(),
        });
        return true;
      },

      saveEmployee: async (companyId, contactId, patch) => {
        if (refuseWhileDown()) return false;
        try {
          await employeeService.syncUpdate(contactId, patch);
        } catch (error) {
          console.error("saveEmployee failed", error);
          dispatch({
            type: "toast/set",
            toast: {
              kind: "error",
              message: employeeUpdateErrorMessage(error),
            },
          });
          return false;
        }

        // The patch carries `companyId`, so a person moved to another company
        // has to be re-read rather than patched: the row belongs under a key
        // this list does not hold yet.
        if (patch.companyId !== companyId) {
          dispatch({ type: "contact/delete", companyId, contactId });
          await reloadEmployees();
        } else {
          dispatch({
            type: "contact/save",
            companyId,
            contactId,
            patch,
            at: new Date().toISOString(),
            silent: true,
          });
        }

        dispatch({
          type: "toast/set",
          toast: { kind: "success", message: MESSAGES.employeeUpdated },
        });
        return true;
      },

      createEmployee: async (payload) => {
        if (refuseWhileDown()) return false;
        try {
          await employeeService.create(payload);
        } catch (error) {
          console.error("createEmployee failed", error);
          dispatch({
            type: "toast/set",
            toast: { kind: "error", message: employeeCreateErrorMessage(error) },
          });
          return false;
        }

        // POST /employees answers with a bare status, so the id and timestamps
        // of the new row can only come from a read.
        await reloadEmployees();
        dispatch({
          type: "toast/set",
          toast: { kind: "success", message: MESSAGES.employeeCreated },
        });
        return true;
      },

      confirmContact: async (companyId, contactId) => {
        if (refuseWhileDown()) return;
        try {
          await employeeService.approve(contactId);
          dispatch({
            type: "contact/confirm",
            companyId,
            contactId,
            at: new Date().toISOString(),
          });
        } catch (error) {
          console.error("confirmContact failed", error);
          dispatch({
            type: "toast/set",
            toast: { kind: "error", message: employeeErrorMessage(error) },
          });
        }
      },

      declineContact: async (companyId, contactId) => {
        if (refuseWhileDown()) return;
        try {
          await employeeService.decline(contactId);
          dispatch({ type: "contact/delete", companyId, contactId });
          dispatch({
            type: "toast/set",
            toast: { kind: "success", message: MESSAGES.employeeDeclined },
          });
        } catch (error) {
          console.error("declineContact failed", error);
          dispatch({
            type: "toast/set",
            toast: { kind: "error", message: declineErrorMessage(error) },
          });
        }
      },

      deleteEmployee: async (companyId, contactId) => {
        if (refuseWhileDown()) return false;
        try {
          await employeeService.syncRemove(contactId);
        } catch (error) {
          console.error("deleteEmployee failed", error);
          dispatch({
            type: "toast/set",
            toast: { kind: "error", message: declineErrorMessage(error) },
          });
          return false;
        }

        dispatch({ type: "contact/delete", companyId, contactId });
        dispatch({
          type: "toast/set",
          toast: { kind: "success", message: MESSAGES.employeeDeleted },
        });
        return true;
      },

      openCompanyForm: (scope, groupId) =>
        dispatch({ type: "company/open", scope, groupId }),
      closeCompanyForm: () => dispatch({ type: "company/close" }),

      saveCompany: async (group, input) => {
        if (refuseWhileDown()) return false;
        // companyId is the whole decision: null means no row exists for this
        // group yet (create, keyed by group id), anything else means one is
        // already there — including one the extraction pass wrote — and must
        // be updated by company id, or the UNIQUE on companies.group_id
        // rejects the insert.
        const creating =
          group.companyId === null || group.companyId === undefined;

        try {
          if (creating) {
            await companyService.create(group.groupId, input);
          } else {
            await companyService.update(group.companyId as number, input);
          }

          // POST /companies/{groupId} answers with a bare status, so the id of
          // the row it just inserted can only come from a read. Without it the
          // group stays companyId: null and "จัดการผู้ติดต่อ" stays hidden
          // until the next full sync — which is what forced a page reload.
          let companyId: number | null | undefined = group.companyId;
          let companies: Company[] | undefined;
          if (creating) {
            try {
              const fresh = await companyService.list();
              companies = fresh;
              companyId =
                fresh.find((company) => company.groupId === group.groupId)?.id ??
                null;
            } catch (error) {
              // The bind itself landed; only the id lookup did not. Say nothing
              // and let the next sync fill it in.
              console.error("company reload after create failed", error);
            }
          }

          dispatch({
            type: "company/save",
            groupId: group.groupId,
            input,
            at: new Date().toISOString(),
            companyId,
            companies,
          });
          return true;
        } catch (error) {
          // The company write is the one place two databases are involved, so
          // "บันทึกข้อมูลไม่สำเร็จ" was never enough — which half failed, and
          // why, only the API knows.
          console.error("saveCompany failed", error);
          dispatch({
            type: "toast/set",
            toast: { kind: "error", message: companyErrorMessage(error) },
          });
          return false;
        }
      },

      unlinkCompany: async (group) => {
        if (refuseWhileDown()) return false;
        if (group.companyId === null || group.companyId === undefined) {
          dispatch({
            type: "toast/set",
            toast: { kind: "error", message: MESSAGES.companyAlreadyUnlinked },
          });
          return false;
        }

        try {
          await companyService.remove(group.companyId);
          dispatch({ type: "company/unlinked", groupId: group.groupId });
          dispatch({
            type: "toast/set",
            toast: { kind: "success", message: MESSAGES.companyUnlinked },
          });
          return true;
        } catch (error) {
          console.error("unlinkCompany failed", error);
          dispatch({
            type: "toast/set",
            toast: {
              kind: "error",
              message: noteErrorMessage(error, MESSAGES.companyUnlinkPrefix),
            },
          });
          return false;
        }
      },

      // Both writes answer with the saved row, so the list is patched from
      // what the database actually stored rather than re-read in full — the
      // modal that fired this is still open and would flicker on a refetch.
      saveCompanyContact: async (companyId, id, input) => {
        if (refuseWhileDown()) return false;
        const editing = id !== null;
        let saved: Contact;
        try {
          saved = editing
            ? await contactService.update(id, input as ContactUpdate)
            : await contactService.create(input as ContactCreate);
        } catch (error) {
          console.error("saveCompanyContact failed", error);
          dispatch({
            type: "toast/set",
            toast: {
              kind: "error",
              message: contactErrorMessage(
                error,
                editing
                  ? MESSAGES.contactUpdatePrefix
                  : MESSAGES.contactCreatePrefix,
              ),
            },
          });
          return false;
        }

        const current = state.companyContacts[companyId] ?? [];
        dispatch({
          type: "company-contacts/set",
          contacts: {
            ...state.companyContacts,
            [companyId]: editing
              ? current.map((person) => (person.id === saved.id ? saved : person))
              : [...current, saved],
          },
        });
        dispatch({
          type: "toast/set",
          toast: {
            kind: "success",
            message: editing ? MESSAGES.contactUpdated : MESSAGES.contactCreated,
          },
        });
        return true;
      },

      deleteCompanyContact: async (companyId, id) => {
        if (refuseWhileDown()) return false;
        try {
          await contactService.remove(id);
        } catch (error) {
          console.error("deleteCompanyContact failed", error);
          dispatch({
            type: "toast/set",
            toast: {
              kind: "error",
              message: contactErrorMessage(error, MESSAGES.contactDeletePrefix),
            },
          });
          return false;
        }

        dispatch({
          type: "company-contacts/set",
          contacts: {
            ...state.companyContacts,
            [companyId]: (state.companyContacts[companyId] ?? []).filter(
              (person) => person.id !== id,
            ),
          },
        });
        dispatch({
          type: "toast/set",
          toast: { kind: "success", message: MESSAGES.contactDeleted },
        });
        return true;
      },

      reloadNotes: async () => {
        try {
          dispatch({ type: "notes/set", notes: await noteService.list() });
        } catch (error) {
          console.error("reloadNotes failed", error);
          dispatch({
            type: "toast/set",
            toast: { kind: "error", message: syncErrorMessage(error) },
          });
        }
      },

      // Create and edit differ only in which endpoint they hit; both re-read
      // the list afterwards, because the company and person names on a card
      // are joined in by the API and cannot be guessed from the request body.
      saveNote: async (id, input) => {
        if (refuseWhileDown()) return false;
        const editing = id !== null;
        try {
          if (editing) await noteService.update(id, input);
          else await noteService.create(input);
        } catch (error) {
          console.error("saveNote failed", error);
          dispatch({
            type: "toast/set",
            toast: {
              kind: "error",
              message: noteErrorMessage(
                error,
                editing ? MESSAGES.noteUpdatePrefix : MESSAGES.noteCreatePrefix,
              ),
            },
          });
          return false;
        }

        try {
          dispatch({ type: "notes/set", notes: await noteService.list() });
        } catch (error) {
          // The write landed; only the refresh did not. Say so rather than
          // reporting a failure that did not happen.
          console.error("note reload after save failed", error);
        }

        dispatch({
          type: "toast/set",
          toast: {
            kind: "success",
            message: editing ? MESSAGES.noteUpdated : MESSAGES.noteCreated,
          },
        });
        return true;
      },

      deleteNote: async (id) => {
        if (refuseWhileDown()) return false;
        try {
          await noteService.remove(id);
        } catch (error) {
          console.error("deleteNote failed", error);
          dispatch({
            type: "toast/set",
            toast: {
              kind: "error",
              message: noteErrorMessage(error, MESSAGES.noteDeletePrefix),
            },
          });
          return false;
        }

        dispatch({
          type: "notes/set",
          notes: state.notes.filter((note) => note.id !== id),
        });
        dispatch({
          type: "toast/set",
          toast: { kind: "success", message: MESSAGES.noteDeleted },
        });
        return true;
      },

      notify: (toast) => dispatch({ type: "toast/set", toast }),
      dismissToast,
      clearToasts,
    };
  }, [state, sync, reloadEmployees, dismissToast, clearToasts]);

  return (
    <ConsoleContext.Provider value={value}>{children}</ConsoleContext.Provider>
  );
}

export function useConsole(): Store {
  const store = useContext(ConsoleContext);
  if (!store) {
    throw new Error("useConsole must be used inside a ConsoleProvider");
  }
  return store;
}
