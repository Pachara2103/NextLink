/**
 * Types with no counterpart at the backend, and none that should ever grow one:
 * which panel is open, how a list is sorted, what the toast says. Everything in
 * here is hand-written on purpose — see `api.ts` for the generated half.
 */

export type SortOption =
  | "time-desc"
  | "time-asc"
  | "group-name"
  | "company-th"
  | "company-en";

/**
 * How the group panel lays its lists out: the original full-width rows, or the
 * card grid. A view preference and nothing more — it changes no data.
 */
export type GroupLayout = "list" | "grid";

export type PanelKey =
  | "contacts"
  | "groups"
  | "notes"
  | "agent"
  | "library";

/**
 * "groups" and "all" are the two buttons in the topbar. "initial" is the mount
 * read: it pulls the cheap endpoints at once so a fresh login already shows the
 * coordinators left over from the last session, without paying for the LLM pass
 * that "all" runs.
 */
export type SyncScope = "all" | "groups" | "initial";

/**
 * Two tones and no more: every notification is either something that worked
 * (green) or something that did not (red). There is no neutral "info" toast —
 * a message with nothing at stake does not earn a slot on screen.
 */
export type ToastKind = "success" | "error";

export type Toast = {
  kind: ToastKind;
  message: string;
};

/**
 * A toast once the store has taken it: the id is what keeps a stacked toast
 * keyed and its own auto-dismiss timer attached to it rather than to whatever
 * happens to be on screen.
 */
export type ToastItem = Toast & { id: number };
