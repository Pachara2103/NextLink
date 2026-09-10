/**
 * The names the console uses for the API's shapes.
 *
 * Nothing here declares a field. `api.ts` is generated from the backend's
 * /openapi.json (`npm run gen:api`), so a Pydantic model in backend/schemas/ is
 * the only place a employee's or a company's fields are written down — this
 * file just gives those generated shapes short names to import.
 */

import type { components } from "./api";

type Schemas = components["schemas"];

// --- resources -----------------------------------------------------------

/** One LINE group, left-joined with the company row it points at. */
export type GroupLine = Schemas["LineGroup"];

/** A company row as `GET /companies` returns it. */
export type Company = Schemas["Company"];

/** Body of both company writes — the create and the rename take the same one. */
export type CompanyInput = Schemas["CompanyName"];

/**
 * A employee row as `GET /employees` returns it.
 *
 * Keyed to a **company**, not to a LINE group: `employees.company_id` is the FK
 * the table actually carries, and a group reaches its people through the
 * company row it points at (`GroupLine.companyId`). There is no `groupId` on
 * this shape to join on.
 */
export type Employee = Schemas["Employee"];

/**
 * Body of every employee write — `POST /employees`, `PUT /employees/{id}` and
 * `PUT /employees/{id}/sync` all take the same one.
 *
 * The seven editable fields plus the two the row cannot exist without: which
 * company the person belongs to, and what state they are in. Only `id` and the
 * timestamps are the server's, which is why the client still never has to strip
 * anything off a read model before sending it.
 */
export type EmployeeUpdate = Schemas["EmployeeBase"];

/** Same body, under the name that reads right at the create call site. */
export type EmployeeCreate = Schemas["EmployeeBase"];

/** The activity a employee is attached to. Closed set, enforced in Python. */
export type RelevantType = Schemas["RelevantType"];

/** One note joined with the company and person names needed to render it. */
export type Note = Schemas["Note"];

/** Body of both note writes — POST /notes and PUT /notes/{id} take the same one. */
export type NoteInput = Schemas["NoteCreate"];

export type NoteType = Schemas["NoteType"];
export type NoteSource = Schemas["NoteSource"];
export type Sentiment = Schemas["Sentiment"];

/**
 * `employees.status`. One value means "not reviewed yet" (`pending`); the other
 * four are where a person stands at the company once they have been. There is
 * no `approved` / `declined` any more — an approval writes `active`, and a
 * decline deletes the row.
 */
export type ContactStatus = Schemas["ContactStatus"];

/** The four states a reviewed employee can be in — everything but `pending`. */
export type EmployeeStatus = Exclude<ContactStatus, "pending">;

/**
 * Company contacts — the people we know *at* a company, entered by hand.
 * Nothing to do with Employee, which is what the extraction pass produces
 * from LINE chat. Hand-written for now; see the note in `contact.ts`.
 */
export type {
  Contact,
  ContactCreate,
  ContactPersonStatus,
  ContactRole,
  ContactUpdate,
} from "./contact";

/** One press of "อัปเดตข้อมูล", as `GET /line/update_logs` returns it. */
export type { UpdateLog } from "./line";

/**
 * คุณขวัญใจ — one turn of a conversation, and the progress of one run.
 * Hand-written for now; see the note at the top of `agent.ts`.
 */
export type {
  AgentEvent,
  AgentHandlers,
  AgentStep,
  AgentStepKey,
  AgentStepState,
  ChatMessage,
  ChatRole,
} from "./agent";

// --- auth ----------------------------------------------------------------

/**
 * The signed-in user as the console shows them. UserProfile, not AuthUser:
 * AuthUser is only what the bearer token proves, and displayName can change
 * while a token is still valid, so the profile is what /auth/me reads back.
 */
export type AuthUser = Schemas["UserProfile"];
export type ProfileUpdate = Schemas["ProfileUpdate"];
export type LoginRequest = Schemas["LoginRequest"];
export type LoginResponse = Schemas["LoginResponse"];

// --- envelopes -----------------------------------------------------------

/**
 * Every list endpoint answers with this one shape, so unwrapping is `.items`
 * everywhere instead of a different key per resource. Written generically
 * because FastAPI emits one concrete `ListResponse_X_` per element type.
 */
export interface ListResponse<T> {
  items: T[];
  total?: number | null;
}

/** Every write that has nothing to return answers with this. */
export type StatusResponse = Schemas["StatusResponse"];

// --- UI-only -------------------------------------------------------------

export type {
  GroupLayout,
  PanelKey,
  PeopleSearchMode,
  SortOption,
  SyncScope,
  Toast,
  ToastItem,
  ToastKind,
} from "./ui";
