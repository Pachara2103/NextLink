import { deleteJson, getJson, postJson, putJson } from "@/lib/services/http";
import type {
  Contact,
  ContactCreate,
  ContactUpdate,
  ListResponse,
  StatusResponse,
} from "@/types";

export function groupByCompanyId(
  list: Contact[],
): Record<number, Contact[]> {
  const byCompany: Record<number, Contact[]> = {};
  for (const person of list) {
    (byCompany[person.companyId] ??= []).push(person);
  }
  return byCompany;
}

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
