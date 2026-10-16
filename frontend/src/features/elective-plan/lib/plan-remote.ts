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
 */

import { electiveService } from "@/lib/services/elective";
import { describeError } from "@/lib/services/errors";
import { emptyDocument } from "./plan-document.ts";
import { readArchivedTerm, readPlan, readTerm } from "./plan-api.ts";
import { blankState, type Reconcile, type RemoteState } from "./plan-state.ts";
import type { PlanPayload, TermMeta } from "./plan-types.ts";
import type { PlanSnapshot } from "./plan-store.ts";

export type CommandContext = { before: RemoteState; after: RemoteState };

export type RemoteCommand = {
  /** Change the screen now. Throws a Thai sentence if the rules forbid it. */
  apply: (state: RemoteState) => RemoteState;
  /** Tell the server. `before` is the state the command started from. */
  send: (context: CommandContext) => Promise<Reconcile | void>;
  /** What the failure message should say this was an attempt to do. */
  what: string;
  /**
   * The command that takes this one back, built once the server has answered.
   *
   * `after` here is the reconciled state, so a row created by this command can
   * be named by the id it really got. Returning null means this action is not
   * offered a "เลิกทำ" — see `removeCourseCommand` for why that is sometimes
   * the honest answer.
   */
  inverse?: (context: CommandContext) => RemoteCommand | null;
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
   * The way back from the last thing that worked.
   *
   * One step, not a stack. The plan is shared, so a second step back would be
   * undoing a state somebody else has since built on — and the control that
   * offers this is a toast that is gone in five seconds, which is exactly the
   * window in which "I meant the other room" is still true.
   */
  private undoCommand: RemoteCommand | null = null;

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
      canUndo: false,
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
    void this.refreshNow();
  };

  private refreshNow(): Promise<boolean> {
    const next = this.queue.then(async () => {
      this.publish({ status: this.snapshot.ready ? this.snapshot.status : "loading" });
      try {
        const plan = await electiveService.plan(this.termId);
        const { payload, assignments, checklists, index } = readPlan(plan);
        // A fresh read is a new starting point: what "เลิกทำ" would have put
        // back was computed against a plan that is no longer on screen.
        this.undoCommand = null;
        this.commit(
          {
            payload,
            index,
            document: { ...emptyDocument(payload), assignments, checklists },
          },
          {
            ready: true, status: "saved", error: null, canUndo: false,
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
    const next = this.queue.then(() => this.perform(command));
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
      const reconcile = await command.send({ before, after });
      const settled = reconcile ? reconcile(this.state) : this.state;
      // Built from the settled state, so a row this command created is named
      // by the id the server gave it rather than its placeholder.
      this.undoCommand = command.inverse?.({ before, after: settled }) ?? null;
      this.commit(settled, { status: "saved", error: null, canUndo: this.undoCommand !== null });
      return true;
    } catch (error) {
      this.undoCommand = null;
      this.commit(before, {
        status: "error",
        error: describeError(error, command.what, FALLBACK),
        canUndo: false,
      });
      return false;
    }
  }

  /**
   * Take the last command back.
   *
   * It runs as a command of its own — the same optimistic draw, the same
   * request, the same rollback if the server refuses. That matters: the state
   * it is putting back may no longer be reachable (someone else took the room
   * in the meantime), and pretending otherwise would show a plan the database
   * does not have.
   */
  undo = async (): Promise<boolean> => {
    const command = this.undoCommand;
    if (!command) return false;
    this.undoCommand = null;
    this.publish({ canUndo: false });
    return this.run(command);
  };

  /** Clear a message the person has read. The plan itself is untouched. */
  clearError = () => this.publish({ error: null, status: this.snapshot.ready ? "saved" : this.snapshot.status });

  reportError = (error: string) => this.publish({ error });

  /** The way out of a failed read: ask again. */
  retry = (): Promise<boolean> => this.refreshNow();
  reload = () => {
    void this.refreshNow();
  };
}

