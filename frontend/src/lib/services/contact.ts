import { deleteJson, getJson, postJson, putJson } from "@/lib/services/http";
import type {
  Contact,
  ContactCreate,
  ContactUpdate,
  ListResponse,
  StatusResponse,
} from "@/types";

/** The console renders per company, the API returns one flat list. */
export function groupByCompanyId(
  list: Contact[],
): Record<number, Contact[]> {
  const byCompany: Record<number, Contact[]> = {};
  for (const person of list) {
    (byCompany[person.companyId] ??= []).push(person);
  }
  return byCompany;
}

/**
 * `contacts` — the people we know at a company, entered by hand.
 *
 * Keyed by **company** id throughout, not by group id: a contact belongs to the
 * company, so unlinking a group and binding it to another one must not carry
 * the old company's people across.
 *
 * Both writes answer with the saved row rather than a bare status, so the card
 * that appears after a save is the row the database actually holds — id,
 * status and timestamps included — instead of a guess assembled from the form.
 */
export const contactService = {
  list: async (): Promise<Contact[]> => {
    const body = await getJson<ListResponse<Contact>>("/api/v1/contacts");
    return body?.items ?? [];
  },

  listByCompany: async (): Promise<Record<number, Contact[]>> =>
    groupByCompanyId(await contactService.list()),

  create: (payload: ContactCreate) =>
    postJson<Contact>("/api/v1/contacts", payload),

  update: (id: number, payload: ContactUpdate) =>
    putJson<Contact>(`/api/v1/contacts/${id}`, payload),

  remove: (id: number) => deleteJson<StatusResponse>(`/api/v1/contacts/${id}`),
};
