/**
 * Company contacts, hand-written for now.
 *
 * Everything else in `types/` comes from `api.ts`, which `npm run gen:api`
 * regenerates from the running backend's /openapi.json. These three shapes
 * mirror `backend/schemas/contact.py` exactly; once gen:api has been run
 * against a backend that carries the /contacts routes, this file can be
 * deleted and `types/index.ts` can point at Schemas["Contact"] instead.
 */

/** contacts.role — who this person is to the department. */
export type ContactRole = "instructor" | "senior" | "alumni" | "insider";

/** contacts.status — whether they are still reachable at that company. */
export type ContactPersonStatus =
  | "active"
  | "resigned"
  | "transferred"
  | "inactive";

/** One row of `contacts` as `GET /contacts` returns it. */
export interface Contact {
  id: number;
  companyId: number;
  name: string;
  nickname: string | null;
  role: ContactRole;
  status: ContactPersonStatus;
  phone: string | null;
  email: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

/**
 * Body of `POST /contacts`. No status: a contact being added is active by
 * definition, and the column defaults to it.
 */
export interface ContactCreate {
  companyId: number;
  name: string;
  nickname: string | null;
  role: ContactRole;
  phone: string | null;
  email: string | null;
}

/**
 * Body of `PUT /contacts/{id}`. No companyId — moving someone to another
 * company is a different operation from correcting their details — but status
 * is here, because whether they still work there is what changes over time.
 */
export interface ContactUpdate {
  name: string;
  nickname: string | null;
  role: ContactRole;
  status: ContactPersonStatus;
  phone: string | null;
  email: string | null;
}
