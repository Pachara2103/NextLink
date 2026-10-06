/**
 * The plan, held on the server, edited as a draft.
 *
 * The localStorage store (`plan-store.ts`) writes the whole plan as one
 * document under a lock, because there is exactly one writer and the only way
 * to be wrong is to be interrupted. A shared plan is the opposite problem:
 * several people are in it, and the last whole-document write would erase
 * everything the others did between their read and their save. So nothing here
 * ever writes "the plan" — every command is one request about one thing: this
 * period moved, this box ticked.
 *
 * *When* a request goes out depends on what was pressed — `RemoteCommand.scope`:
 *
 * - **`"now"`** — everything outside the board. Adding a course, editing a
 *   room, ticking a paperwork box: one press, one request, the screen moves
 *   first and goes back if the server refuses. These are single, deliberate
 *   acts with a form or a confirmation behind them, and holding them back
 *   would only invent a second thing to remember to press.
 * - **`"timetable"`** — moving classes around the week grid, and nothing else.
 *   Placing a class is not one act: it is twenty drags where the first
 *   nineteen are thinking out loud. Those are drawn on screen and held in a
 *   queue until บันทึก on the board itself, so the room everyone else is
 *   reading does not flicker through nineteen wrong answers first.
 *
 * Both paths run `apply` at the moment of the press, so a drag the rules forbid
 * is refused there and never becomes either a request or a queued edit.
 *
 * What the queue costs is that a period drawn into it has no database id until
 * บันทึก reaches it, so a later command in the same queue may name a row the
 * server has not made yet. That is what `naming` and the `id` resolver in
 * `CommandContext` are for: as each command is sent, the rows it created report
 * the ids they were given, and every command after it looks its ids up through
 * that map.
 *
 * Still true from before: last-write-wins. Two people saving drafts of the
 * same term will not corrupt each other's rows, but the later save wins the
 * fields they both touched. The team is small and sits together; a 409 on
 * screen costs more than it is worth. `refresh` is the honest mitigation — it
 * re-reads the plan, and it refuses to run while the board has unsaved moves
 * rather than silently throwing them away.
 */

import { electiveService } from "@/lib/services/elective";
import { describeError } from "@/lib/services/errors";
import { emptyDocument } from "./plan-document.ts";
import { readPlan, readTerm } from "./plan-api.ts";
import { blankState, type Reconcile, type RemoteState } from "./plan-state.ts";
import type { PlanPayload } from "./plan-types.ts";
import type { PlanSnapshot } from "./plan-store.ts";

export type CommandContext = {
  /** The state this command was pressed against. */
  before: RemoteState;
  /** The state it drew. Request bodies are built from these two, not from the
   *  live state, because they describe what the person actually did. */
  after: RemoteState;
  /**
   * The id a row has on the server, given the id it was drawn under here.
   *
   * Identity outside the draft, and the real id for anything created earlier
   * in the same save. Every `serverId` call in a command's `send` goes through
   * this; one that does not will fail on the first course somebody adds and
   * then schedules before pressing บันทึก.
   */
  id: (value: string) => string;
  /** The live state, reconciled with everything saved so far in this pass. */
  current: () => RemoteState;
};

export type RemoteCommand = {
  /**
   * When this reaches the database.
   *
   * `"now"` on the press; `"timetable"` when somebody saves the board. See the
   * file header for why the board is the one thing that waits.
   */
  scope: "now" | "timetable";
  /** Change the screen now. Throws a Thai sentence if the rules forbid it. */
  apply: (state: RemoteState) => RemoteState;
  /** Tell the server — at the press, or at บันทึก, per `scope`. */
  send: (context: CommandContext) => Promise<Reconcile | void>;
  /** What the failure message should say this was an attempt to do. */
  what: string;
  /** What this command is called in the board's list of unsaved moves. */
  label: string;
  /**
   * Rows this command drew before the server had named them, reported once it
   * has: `[id it was drawn under, id it really got]`. Read from the state the
   * server's answer settled into.
   */
  naming?: (settled: RemoteState) => Array<readonly [string, string]>;
};

const FALLBACK = {
  network: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ยังบันทึกไม่ได้",
  unknown: "บันทึกไม่สำเร็จ",
};

/** One press: the command, and the states on either side of it. */
type DraftEdit = {
  command: RemoteCommand;
  before: RemoteState;
  after: RemoteState;
};

/** Identical to the offline store's, plus what the board's save bar reads. */
export type RemoteSnapshot = PlanSnapshot & {
  /** Board moves waiting to be sent. 0 = everything is on the server. */
  unsaved: number;
  canRedo: boolean;
  /** What those moves were, oldest first — the save button's tooltip. */
  unsavedLabels: string[];
  /**
   * True when a save stopped part-way through.
   *
   * Some of the queue reached the database and the rest did not, so the
   * timetable this store remembers from before the save no longer describes
   * anything the server would recognise. Putting it back would show a plan that
   * does not exist; the honest ways out are to try the save again, or to throw
   * the rest away and re-read.
   */
  blocked: boolean;
};

export class RemotePlanStore {
  private state = blankState();
  private snapshot: RemoteSnapshot;
  private listeners = new Set<() => void>();
  private queue: Promise<unknown> = Promise.resolve();
  private loaded = false;
  /** Board moves drawn and not yet sent. Oldest first. */
  private pending: DraftEdit[] = [];
  private blocked = false;
  /**
   * Which term is on screen. Not `readonly`: a term that has ended is a plan
   * like any other now — see `selectTerm`.
   */
  private termId?: number;

  /** Same shape as the offline store's, so the provider can hold either. */
  readonly key = "api";

  constructor(termId?: number) {
    this.termId = termId;
    this.snapshot = {
      payload: this.state.payload,
      document: this.state.document,
      ready: false,
      status: "loading",
      error: null,
      recoveryRaw: null,
      canUndo: false,
      terms: [],
      archives: [],
      unsaved: 0,
      canRedo: false,
      unsavedLabels: [],
      blocked: false,
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

  /** Everything the draft's own controls read, in one place. */
  private draftPatch(extra: Partial<RemoteSnapshot> = {}): Partial<RemoteSnapshot> {
    return {
      status: this.pending.length ? "draft" : "saved",
      unsaved: this.pending.length,
      unsavedLabels: this.pending.map((edit) => edit.command.label),
      // Nothing on the shared plan offers a step-back any more: what is not on
      // the board is already saved, and what is on the board is thrown away
      // whole by ยกเลิก rather than one move at a time.
      canUndo: false,
      canRedo: false,
      blocked: this.blocked,
      ...extra,
    };
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
   * way out of an error. It throws away nothing only because it refuses to run
   * while a draft is open — see `refreshNow`.
   */
  refresh = () => {
    if (!this.loaded || !this.snapshot.ready) return;
    void this.refreshNow();
  };

  private refreshNow(force = false): Promise<boolean> {
    const next = this.queue.then(async () => {
      // A draft is work somebody has done and not yet saved; a focus event is
      // not a reason to discard it. `discard` and `retry` pass force.
      if (!force && this.pending.length) return true;
      this.publish({ status: this.snapshot.ready ? this.snapshot.status : "loading" });
      try {
        const plan = await electiveService.plan(this.termId);
        const { payload, assignments, checklists, index } = readPlan(plan);
        this.pending = [];
        this.blocked = false;
        this.commit(
          {
            payload,
            index,
            document: { ...emptyDocument(payload), assignments, checklists },
          },
          {
            ...this.draftPatch(),
            ready: true,
            status: "saved",
            error: null,
            // The switcher offers the term that is on screen from the first
            // paint; the rest of the list arrives a moment later.
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
   * The term switcher's list.
   *
   * Read after the plan rather than with it: the page is usable the moment the
   * term being looked at is on screen, and which *other* terms exist is only
   * needed once somebody reaches for the switcher.
   *
   * It used to go on to read every finished term's whole plan as well, because
   * a past term was shown from a separate read-only copy. `selectTerm` reads
   * the one the person actually asked for instead — so a department with
   * twenty terms of history costs one request here, not twenty-one.
   */
  private async loadTerms(): Promise<void> {
    try {
      this.publish({ terms: (await electiveService.listTerms()).map(readTerm) });
    } catch {
      // The switcher falls back to the term already on screen.
      this.publish({ terms: this.snapshot.terms.length ? this.snapshot.terms : [this.state.payload.term] });
    }
  }

  /**
   * One press.
   *
   * `apply` runs inside the queue against the newest state, not against what
   * the component rendered — two controls pressed in the same tick both see
   * the plan the other left behind. Where it goes from there is the command's
   * `scope`: the board's moves wait for บันทึก, everything else is sent now.
   */
  run = (command: RemoteCommand): Promise<boolean> => {
    const next = this.queue.then(() =>
      command.scope === "timetable" ? this.draw(command) : this.perform(command),
    );
    this.queue = next.catch(() => false);
    return next;
  };

  /** Shared by both paths: refuse, or draw, and say which. */
  private applied(command: RemoteCommand): RemoteState | null {
    if (!this.snapshot.ready) {
      this.publish({ error: "กำลังโหลดแผน กรุณารอสักครู่" });
      return null;
    }
    if (this.blocked && command.scope === "timetable") {
      this.publish({ error: "การบันทึกตารางครั้งล่าสุดค้างอยู่ กรุณาลองบันทึกอีกครั้ง หรือกดยกเลิกการแก้ไข" });
      return null;
    }
    try {
      return command.apply(this.state);
    } catch (error) {
      // A rule the planner already knows about — the drag was never valid, so
      // nothing was sent, nothing was queued, nothing has to be put back.
      this.publish({ error: error instanceof Error ? error.message : "ทำรายการไม่ได้" });
      return null;
    }
  }

  /** A board move: on screen now, on the queue until บันทึก. */
  private draw(command: RemoteCommand): boolean {
    const before = this.state;
    const after = this.applied(command);
    if (!after) return false;
    this.pending.push({ command, before, after });
    this.commit(after, this.draftPatch({ error: null }));
    return true;
  }

  /**
   * Everything else: on screen now, and sent before the press has settled.
   *
   * Optimistic because a form that waits for the network before showing what it
   * did feels broken on a slow connection; reversed on refusal because the
   * message that comes back ("ห้องนี้มีคลาสอยู่แล้วในคาบนี้") is about the thing
   * just pressed, and is only useful while that thing is still on screen.
   */
  private async perform(command: RemoteCommand): Promise<boolean> {
    const before = this.state;
    const after = this.applied(command);
    if (!after) return false;

    this.commit(after, { status: "saving", error: null });
    try {
      const reconcile = await command.send({
        before,
        after,
        id: (value) => value,
        current: () => this.state,
      });
      const settled = reconcile ? reconcile(this.state) : this.state;
      this.commit(settled, this.draftPatch({ error: null }));
      return true;
    } catch (error) {
      // Only this command's half of the state goes back: the board may be
      // holding unsaved moves that have nothing to do with what just failed.
      this.commit(
        { ...before, document: { ...before.document, assignments: this.state.document.assignments } },
        this.draftPatch({ status: "error", error: describeError(error, command.what, FALLBACK) }),
      );
      return false;
    }
  }

  /**
   * Throw the board's unsaved moves away.
   *
   * Only the periods go back, not the whole plan: a course added or a box
   * ticked while the board was being worked on is already saved, and ยกเลิก on
   * the board has no business undoing it. After a half-finished save there is
   * nothing local worth trusting, so that case re-reads instead.
   */
  discard = (): Promise<boolean> => {
    if (this.blocked) return this.refreshNow(true);
    return this.enqueue(() => {
      const first = this.pending[0];
      if (!first) return true;
      this.pending = [];
      this.commit(
        { ...this.state, document: { ...this.state.document, assignments: first.before.document.assignments } },
        this.draftPatch({ status: "saved", error: null }),
      );
      return true;
    });
  };

  /**
   * Show another term — including one that has ended.
   *
   * A finished term used to be read through a separate, read-only shape,
   * because "ปิดเทอม" was taken to mean the record was complete. It is not:
   * paperwork arrives late and whole terms get entered after the fact. So a
   * past term is now loaded the same way as the term being planned, through
   * this store, and every control on every planner page works on it.
   *
   * Refused while a draft is open rather than quietly dropping it: the draft
   * belongs to the term it was made against, and carrying it across would
   * write one term's edits into another's rows.
   */
  selectTerm = (termId: number | undefined): Promise<boolean> => {
    if (termId === this.termId) return Promise.resolve(true);
    if (this.pending.length) {
      this.publish({ error: "ยังมีการแก้ไขที่ไม่ได้บันทึก กรุณาบันทึกหรือยกเลิกก่อนเปลี่ยนเทอม" });
      return Promise.resolve(false);
    }
    this.termId = termId;
    return this.refreshNow(true);
  };

  /**
   * Send the board's moves, in order, and stop at the first refusal.
   *
   * In order because the moves were made in an order that means something: a
   * class is placed before it is moved, and moved before it is locked. One at a
   * time for the same reason — and because a refusal has to be attributable to
   * the move that caused it, which a parallel burst cannot do.
   *
   * A refusal leaves everything from that move onwards on the queue and the
   * board exactly as it is, so nothing is lost; what it does cost is ยกเลิก,
   * because the timetable this store remembers from before the save is now
   * half-written. See `blocked`.
   */
  save = (): Promise<boolean> => this.enqueue(() => this.flush());

  private async flush(): Promise<boolean> {
    if (!this.pending.length) return true;

    this.publish({ status: "saving", error: null });

    /** Drawn id -> the id the server gave it, for this pass. */
    const aliases = new Map<string, string>();
    const context = {
      id: (value: string) => aliases.get(value) ?? value,
      current: () => this.state,
    };

    let saved = 0;
    while (this.pending.length) {
      const edit = this.pending[0];
      try {
        const reconcile = await edit.command.send({ before: edit.before, after: edit.after, ...context });
        const settled = reconcile ? reconcile(this.state) : this.state;
        for (const [drawn, real] of edit.command.naming?.(settled) ?? []) {
          if (drawn !== real) aliases.set(drawn, real);
        }
        this.state = settled;
        this.pending.shift();
        saved += 1;
      } catch (error) {
        this.blocked = saved > 0;
        const why = describeError(error, edit.command.what, FALLBACK);
        this.commit(this.state, this.draftPatch({
          status: "error",
          error: saved
            ? `${why} (บันทึกไปแล้ว ${saved} รายการ ที่เหลือยังไม่ได้บันทึก)`
            : why,
        }));
        return false;
      }
    }

    this.blocked = false;
    // The rows that came back carry the ids and timestamps the screen could
    // not know; everything else on screen is already what was sent.
    this.commit(this.state, this.draftPatch({ status: "saved", error: null }));
    return true;
  }

  private enqueue<T>(work: () => T | Promise<T>): Promise<T> {
    const next = this.queue.then(work);
    this.queue = next.catch(() => undefined);
    return next;
  }

  /** Clear a message the person has read. The plan itself is untouched. */
  clearError = () =>
    this.publish({ error: null, status: this.snapshot.ready ? (this.pending.length ? "draft" : "saved") : this.snapshot.status });

  reportError = (error: string) => this.publish({ error });

  /** The way out of a failed read: ask again, unsaved board moves and all. */
  retry = (): Promise<boolean> => this.refreshNow(true);
  reload = () => {
    void this.refreshNow();
  };
}
