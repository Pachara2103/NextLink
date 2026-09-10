import { ITEMS_PER_PAGE } from "@/lib/constants";
import type { Employee, GroupLine, SortOption } from "@/types";

/**
 * Case-insensitive substring match across the searchable fields: the LINE
 * group's name, the company's Thai and English names, and the company's short
 * names — the same set the notes page searches, because a short name is often
 * the only thing anyone remembers a company by.
 *
 * A blank term matches nothing on purpose: the results block stays hidden
 * instead of listing every group.
 */
export function searchGroups(groups: GroupLine[], term: string): GroupLine[] {
  const needle = term.trim().toLowerCase();
  if (!needle) return [];
  return groups.filter((g) =>
    [g.displayName, g.companyTh, g.companyEn, ...(g.aliases ?? [])].some(
      (field) => (field ?? "").toLowerCase().includes(needle),
    ),
  );
}

/**
 * Case-insensitive substring match over the three name fields, for the people
 * directory's "ค้นหาชื่อบุคคล" mode. Nothing else is searched: a phone number
 * or a job title is something you read off a card once you have found the
 * person, not something you go looking for them by.
 *
 * A blank term matches nothing, the same way searchGroups does, so the results
 * block stays hidden instead of listing everybody.
 */
export function searchEmployees(
  employees: Employee[],
  term: string,
): Employee[] {
  const needle = term.trim().toLowerCase();
  if (!needle) return [];
  return employees.filter((person) =>
    [person.nameEn, person.nameTh, person.nickname].some((field) =>
      (field ?? "").toLowerCase().includes(needle),
    ),
  );
}

function time(iso: string | null | undefined, fallback: number): number {
  if (!iso) return fallback;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? fallback : t;
}

/**
 * Null handling mirrors the Python sort_groups: name sorts treat null as an
 * empty string (blanks first), while rows without updatedAt land last in both
 * time directions.
 */
export function sortGroups(
  groups: GroupLine[],
  sortBy: SortOption,
): GroupLine[] {
  const byText =
    (pick: (g: GroupLine) => string | null | undefined) =>
    (a: GroupLine, b: GroupLine) =>
      (pick(a) ?? "")
        .toLowerCase()
        .localeCompare((pick(b) ?? "").toLowerCase(), "th");

  const sorted = [...groups];
  switch (sortBy) {
    case "group-name":
      return sorted.sort(byText((g) => g.displayName));
    case "company-th":
      return sorted.sort(byText((g) => g.companyTh));
    case "company-en":
      return sorted.sort(byText((g) => g.companyEn));
    case "time-desc":
      return sorted.sort(
        (a, b) =>
          time(b.updatedAt, Number.NEGATIVE_INFINITY) -
          time(a.updatedAt, Number.NEGATIVE_INFINITY),
      );
    case "time-asc":
      return sorted.sort(
        (a, b) =>
          time(a.updatedAt, Number.POSITIVE_INFINITY) -
          time(b.updatedAt, Number.POSITIVE_INFINITY),
      );
    default:
      return sorted;
  }
}

export function paginate<T>(
  items: T[],
  page: number,
  perPage: number = ITEMS_PER_PAGE,
): { page: number; totalPages: number; items: T[] } {
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const current = Math.min(Math.max(1, page), totalPages);
  const start = (current - 1) * perPage;
  return {
    page: current,
    totalPages,
    items: items.slice(start, start + perPage),
  };
}

/**
 * Newest first, for the employee rows inside one group card. The reviewer
 * reads a group top-down, so the row that changed most recently has to be the
 * first one they see. Rows without updatedAt sink to the bottom, the same way
 * sortGroups treats them under time-desc.
 */
export function sortByUpdatedDesc<
  T extends { updatedAt: string | null | undefined },
>(items: T[]): T[] {
  return [...items].sort(
    (a, b) =>
      time(b.updatedAt, Number.NEGATIVE_INFINITY) -
      time(a.updatedAt, Number.NEGATIVE_INFINITY),
  );
}

/**
 * The people directory's own order: the company whose staff list changed most
 * recently first.
 *
 * A group is ranked by its newest employee rather than by its own updatedAt,
 * because `line_groups.updated_at` moves when the group is renamed or its
 * company is rebound — neither of which is what this page is about. A group
 * with nobody in it has no employee to rank by, so it falls back to its own
 * timestamp and naturally sinks below the ones being worked on.
 */
export function sortByLatestPerson<T extends { updatedAt: string | null }>(
  rows: { group: T; people: { updatedAt: string | null }[] }[],
): { group: T; people: { updatedAt: string | null }[] }[] {
  const rank = (row: { group: T; people: { updatedAt: string | null }[] }) =>
    row.people.length > 0
      ? Math.max(
          ...row.people.map((person) =>
            time(person.updatedAt, Number.NEGATIVE_INFINITY),
          ),
        )
      : time(row.group.updatedAt, Number.NEGATIVE_INFINITY);

  return [...rows].sort((a, b) => rank(b) - rank(a));
}
