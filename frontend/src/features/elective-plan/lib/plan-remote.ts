/**
 * The plan, held on the server.
 *
 * The localStorage store (`plan-store.ts`) writes the whole plan as one
 * document under a lock, because there is exactly one writer and the only way
 * to be wrong is to be interrupted. A shared plan is the opposite problem:
 * several people are in it, each pressing one control at a time, and the last
 * whole-document write would erase everything the others did between their
 * read and their save. So every command here is one request about one thing —
 * this period moved, this box ticked — and the server is the one that decides
 * what the plan now is.
 *
 * Which means the screen has to move before the server answers. A planner
 * dragging a class across a timetable cannot wait 200ms per drag to see it
 * land. Each command therefore:
 *
 *   1. changes the screen straight away, using the same pure rules the offline
 *      store uses (`placeAssignment`, `patchCourse`, `validateCourseDraft`) —
 *      so a move the rules forbid never reaches the network at all;
 *   2. sends its one request;
 *   3. on success, folds in whatever the server decided that the screen could
 *      not know — above all the row's real id;
 *   4. on failure, puts the screen back exactly as it was and says why, in the
 *      backend's own words.
 *
 * Step 4 is the whole reason a command carries its `before` state rather than
 * trusting a reload to fix things: the message that comes back ("ห้องนี้มีคลาส
 * อยู่แล้วในคาบนี้") is about the thing the person just did, and it is only
 * useful while the thing they just did is still on screen to be corrected.
 *
 * Commands run one at a time. Two drags in quick succession are two requests
 * in order, not two racing reads of the same list.
 *
 * The week timetable is the one exception, and it is deliberate. Laying out a
 * week is not a series of decisions, it is one decision taken in twenty drags:
 * a planner shuffles classes between rooms and periods until the whole week
 * works, and half of those positions are ones they are only trying out. So a
 * command marked `scope: "timetable"` changes the screen and stops there, and
 * บันทึก sends the finished week as one request — the same bulk swap
 * "จัดตารางใหม่" uses, which the server applies in a transaction or
 * refuses whole. ยกเลิก puts the week back to the last one the server
 * confirmed. Everything else — a course edited, a box ticked, a room added —
 * is one decision and is still sent at the press.
 */

import { electiveService } from "@/lib/services/elective";
import { describeError } from "@/lib/services/errors";
import { emptyDocument, type PlanDocument } from "./plan-document.ts";
// The only edge back to the command file, and it is one function: the bulk
// swap that บันทึก sends. Everything in plan-commands.ts points this way,
// and only at the type, so there is no cycle at runtime.
import { replaceCommand } from "./plan-commands.ts";
import { readArchivedTerm, readPlan, readTerm } from "./plan-api.ts";
import { blankState, type Reconcile, type RemoteState } from "./plan-state.ts";
import type { PlanPayload } from "./plan-types.ts";
import type { PlanSnapshot } from "./plan-store.ts";

export type CommandContext = { before: RemoteState; after: RemoteState };

export type RemoteCommand = {
  /**
   * Where this change is written.
   *
   * `"now"` (the default) sends at the press. `"timetable"` draws it and waits
   * for บันทึก on the board, and so needs no `send` of its own.
   */
  scope?: "now" | "timetable";
  /** Change the screen now. Throws a Thai sentence if the rules forbid it. */
  apply: (state: RemoteState) => RemoteState;
  /** Tell the server. `before` is the state the command started from. */
  send?: (context: CommandContext) => Promise<Reconcile | void>;
  /** What the failure message should say this was an attempt to do. */
  what: string;
  /** How this edit is named in the list of what is waiting to be saved. */
  label?: string;
};

const FALLBACK = {
  network: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ การแก้ไขล่าสุดถูกยกเลิก",
  unknown: "บันทึกไม่สำเร็จ การแก้ไขล่าสุดถูกยกเลิก",
};

/** Identical to the offline store's, so either can sit behind the provider. */
export type RemoteSnapshot = PlanSnapshot;

export class RemotePlanStore {
  private state = blankState();
  private snapshot: RemoteSnapshot;
  private listeners = new Set<() => void>();
  private queue: Promise<unknown> = Promise.resolve();
  private loaded = false;
  /**
   * The board edits that have not been sent, and the week to put back.
   *
   * `baseline` is the timetable as the server last confirmed it, kept from the
   * moment the first unsaved drag happens. ยกเลิก restores exactly that —
   * only the periods, never the courses or rooms, because those were saved at
   * the press and are not this button's to undo.
   */
  private pending: string[] = [];
  private baseline: PlanDocument["assignments"] | null = null;

  /** Same shape as the offline store's, so the provider can hold either. */
  readonly key = "api";

  constructor(private readonly termId?: number) {
    this.snapshot = {
      payload: this.state.payload,
      document: this.state.document,
      ready: false,
      status: "loading",
      error: null,
      recoveryRaw: null,
      unsaved: 0,
      unsavedLabels: [],
      terms: [],
      archives: [],
    };
  }

  get payload(): PlanPayload {
    return this.state.payload;
  }

  getState = (): RemoteState => this.state;
  getSnapshot = (): RemoteSnapshot => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private publish(patch: Partial<RemoteSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  private commit(state: RemoteState, patch: Partial<RemoteSnapshot> = {}) {
    this.state = state;
    this.publish({ payload: state.payload, document: state.document, ...patch });
  }

  load = () => {
    if (this.loaded) return;
    this.loaded = true;
    void this.refreshNow();
  };

  /**
   * Read the whole plan again.
   *
   * Used on first paint, when the tab is brought back to the front, and as the
   * way out of an error — there is no merge to attempt, because the server is
   * the plan and whatever is on screen is only ever a picture of it.
   */
  refresh = () => {
    // Coming back to the tab is a good moment to see what other people did —
    // but not while the first read is still in flight, which is what a focus
    // event right after load would otherwise trigger.
    if (!this.loaded || !this.snapshot.ready) return;
    // Not while the board has edits waiting: a read would replace them with
    // the server's week, which is the one thing บันทึก exists to prevent.
    if (this.pending.length) return;
    void this.refreshNow();
  };

  private refreshNow(): Promise<boolean> {
    const next = this.queue.then(async () => {
      this.publish({ status: this.snapshot.ready ? this.snapshot.status : "loading" });
      try {
        const plan = await electiveService.plan(this.termId);
        const { payload, assignments, checklists, index } = readPlan(plan);
        // A fresh read is a new starting point: the week on screen is the
        // week the server has, so there is nothing waiting and nothing to
        // put back.
        this.pending = [];
        this.baseline = null;
        this.commit(
          {
            payload,
            index,
            document: { ...emptyDocument(payload), assignments, checklists },
          },
          {
            ready: true, status: "saved", error: null, unsaved: 0, unsavedLabels: [],
            // The switcher offers the term that is on screen from the first
            // paint; the rest of the list arrives a moment later. A page that
            // renders before it knows every term must still know this one.
            terms: [payload.term],
          },
        );
        void this.loadTerms();
        return true;
      } catch (error) {
        this.publish({
          ready: true,
          status: "error",
          error: describeError(error, "โหลดแผนไม่สำเร็จ", {
            network: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ยังโหลดแผนไม่ได้",
            unknown: "โหลดแผนไม่สำเร็จ",
          }),
        });
        return false;
      }
    });
    this.queue = next.catch(() => undefined);
    return next;
  }

  /**
   * The term switcher's list, and then the finished terms behind it.
   *
   * Read after the plan rather than with it, and one at a time: the page is
   * usable the moment the current term is on screen, and history is what the
   * switcher offers next, not what it waits for. A term that fails to load is
   * simply not offered — nothing on this page depends on it.
   */
  /**
   * Read the term list again.
   *
   * The one thing that changes a finished term from this page is a course
   * backfilled into it, and that course is read back from the term's own plan
   * — so the way to show it is to read the archives again rather than to
   * patch a list the component does not own.
   */
  refreshTerms = (): Promise<void> => {
    const next = this.queue.then(() => this.loadTerms());
    this.queue = next.catch(() => undefined);
    return next;
  };

  private async loadTerms(): Promise<void> {
    try {
      const terms = await electiveService.listTerms();
      this.publish({ terms: terms.map(readTerm) });

      const archives: RemoteSnapshot["archives"] = [];
      for (const term of terms) {
        if (term.status !== "archived") continue;
        try {
          archives.push(readArchivedTerm(await electiveService.plan(term.id)));
          this.publish({ archives: [...archives] });
        } catch {
          /* a term that will not load is a term the switcher does not offer */
        }
      }
    } catch {
      // The switcher falls back to the term already on screen.
      this.publish({ terms: this.snapshot.terms.length ? this.snapshot.terms : [this.state.payload.term] });
    }
  }

  /**
   * One command: change the screen, tell the server, put it back if refused.
   *
   * `apply` runs inside the queue against the newest state, not against what
   * the component rendered — two controls pressed in the same tick both see
   * the plan the other left behind.
   */
  run = (command: RemoteCommand): Promise<boolean> => {
    const next = this.queue.then(() =>
      command.scope === "timetable" ? this.draw(command) : this.perform(command),
    );
    this.queue = next.catch(() => false);
    return next;
  };

  /**
   * A board edit: change the screen, remember how to put it back, send nothing.
   *
   * It still runs inside the queue and still goes through `apply`, so a drag
   * the rules forbid is refused here exactly as it would be if it were about
   * to be sent — waiting to save must not mean waiting to find out.
   */
  private draw(command: RemoteCommand): boolean {
    if (!this.snapshot.ready) {
      this.publish({ error: "กำลังโหลดแผน กรุณารอสักครู่" });
      return false;
    }

    const before = this.state;
    let after: RemoteState;
    try {
      after = command.apply(before);
    } catch (error) {
      this.publish({ error: error instanceof Error ? error.message : "ทำรายการไม่ได้" });
      return false;
    }

    if (this.baseline === null) this.baseline = before.document.assignments;
    this.pending = [...this.pending, command.label ?? command.what];
    this.commit(after, {
      status: "draft",
      error: null,
      unsaved: this.pending.length,
      unsavedLabels: this.pending,
    });
    return true;
  }

  /**
   * Send the week as it now stands.
   *
   * One request for the whole timetable rather than one per drag: the periods
   * only make sense together (a class moved out of a room is what lets another
   * move in), and the server's bulk swap either takes the lot or leaves the
   * saved week untouched. A refusal therefore keeps the edits on screen with
   * the reason beside them, which is the only state from which they can be
   * corrected.
   */
  save = (): Promise<boolean> => {
    if (!this.pending.length) return Promise.resolve(true);
    const next = this.queue.then(async () => {
      const ok = await this.perform(
        replaceCommand(this.state.document.assignments, "บันทึกตารางไม่สำเร็จ"),
      );
      if (ok) {
        this.pending = [];
        this.baseline = null;
        this.publish({ unsaved: 0, unsavedLabels: [] });
      }
      return ok;
    });
    this.queue = next.catch(() => false);
    return next;
  };

  /** Put the week back to the last one the server confirmed. */
  discard = (): Promise<boolean> => {
    if (!this.pending.length) return Promise.resolve(true);
    const next = this.queue.then(async () => {
      const baseline = this.baseline;
      this.pending = [];
      this.baseline = null;
      if (!baseline) return this.refreshNow();
      this.commit(
        { ...this.state, document: { ...this.state.document, assignments: baseline } },
        { status: "saved", error: null, unsaved: 0, unsavedLabels: [] },
      );
      return true;
    });
    this.queue = next.catch(() => false);
    return next;
  };

  private async perform(command: RemoteCommand): Promise<boolean> {
    if (!this.snapshot.ready) {
      this.publish({ error: "กำลังโหลดแผน กรุณารอสักครู่" });
      return false;
    }

    const before = this.state;
    let after: RemoteState;
    try {
      after = command.apply(before);
    } catch (error) {
      // A rule the planner already knows about — the drag was never valid, so
      // nothing was sent and nothing has to be put back.
      this.publish({ error: error instanceof Error ? error.message : "ทำรายการไม่ได้" });
      return false;
    }

    this.commit(after, { status: "saving", error: null });

    try {
      const reconcile = await command.send?.({ before, after });
      const settled = reconcile ? reconcile(this.state) : this.state;
      this.commit(settled, { status: "saved", error: null });
      return true;
    } catch (error) {
      this.commit(before, {
        status: "error",
        error: describeError(error, command.what, FALLBACK),
      });
      return false;
    }
  }

  /** Clear a message the person has read. The plan itself is untouched. */
  clearError = () => this.publish({ error: null, status: this.snapshot.ready ? "saved" : this.snapshot.status });

  reportError = (error: string) => this.publish({ error });

  /** The way out of a failed read: ask again. */
  retry = (): Promise<boolean> => this.refreshNow();
  reload = () => {
    void this.refreshNow();
  };
}

