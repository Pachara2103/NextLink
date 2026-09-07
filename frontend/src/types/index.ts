/**
 * The names the console uses for the API's shapes.
 *
 * Nothing here declares a field. `api.ts` is generated from the backend's
 * /openapi.json (`npm run gen:api`), so a Pydantic model in backend/schemas/ is
 * the only place a coordinator's or a company's fields are written down — this
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

/** A coordinator row as `GET /coordinators` returns it. */
export type Coordinator = Schemas["Coordinator"];

/**
 * Body of `PUT /coordinators/{id}`: the seven editable fields and nothing else.
 * id lives in the path and status/timestamps belong to the server, which is why
 * the client no longer has to strip them off a read model before sending it.
 */
export type CoordinatorUpdate = Schemas["CoordinatorCreate"];

/** The activity a coordinator is attached to. Closed set, enforced in Python. */
export type RelevantType = Schemas["RelevantType"];

/** One note joined with the company and person names needed to render it. */
export type Note = Schemas["Note"];

/** Body of both note writes — POST /notes and PUT /notes/{id} take the same one. */
export type NoteInput = Schemas["NoteCreate"];

export type NoteType = Schemas["NoteType"];
export type NoteSource = Schemas["NoteSource"];
export type Sentiment = Schemas["Sentiment"];

/** Approval state of one extracted coordinator. */
export type ContactStatus = Schemas["ApprovalStatus"];

/**
 * Company contacts — the people we know *at* a company, entered by hand.
 * Nothing to do with Coordinator, which is what the extraction pass produces
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
  SortOption,
  SyncScope,
  Toast,
  ToastItem,
  ToastKind,
} from "./ui";
