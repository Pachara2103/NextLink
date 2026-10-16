import { decodePlan, emptyDocument, legacyKeysFor, storageKeyFor, type PlanData, type PlanDocument } from "./plan-document.ts";
import type { ArchivedTerm, PlanPayload, TermMeta } from "./plan-types.ts";

export type Persistence = {
  read: (key: string) => string | null;
  write: (key: string, value: string) => void;
  exclusive: <T>(name: string, work: () => Promise<T>) => Promise<T>;
};
/**
 * What either store publishes, so a component never has to know which one it
 * is reading. `payload`, `terms` and `archives` are constants here — a bundled
 * plan is the file it was built from — and state on the server-backed store.
 */
export type PlanSnapshot = {
  payload: PlanPayload;
  document: PlanDocument;
  ready: boolean;
  /**
   * `"draft"` is the week board holding edits that have not been sent. It is
   * only ever reached on the shared plan; a plan kept in this browser is
   * written at the press, so there is nothing to wait for.
   */
  status: "loading" | "saved" | "saving" | "error" | "draft";
  error: string | null;
  recoveryRaw: string | null;
  /** How many board edits are waiting for บันทึก, and what they were. */
  unsaved: number;
  unsavedLabels: string[];
  /** Every term the switcher offers. Read from the API; bundled in seed mode. */
  terms: TermMeta[];
  archives: ArchivedTerm[];
};
type Mutation = (document: PlanDocument) => PlanData | Promise<PlanData>;

/** One store per app layout. Commands read fresh state inside the shared lock. */
export class PlanStore {
  readonly key: string;
  private snapshot: PlanSnapshot;
  private listeners = new Set<() => void>();
  private queue: Promise<unknown> = Promise.resolve();
  private baseRaw: string | null | undefined;
  private dirty = false;

  readonly payload: PlanPayload;
  private persistence: Persistence;
  constructor(payload: PlanPayload, persistence: Persistence) {
    this.payload = payload;
    this.persistence = persistence;
    this.key = storageKeyFor(payload.term.id);
    this.snapshot = { payload, document: emptyDocument(payload), ready: false, status: "loading", error: null, recoveryRaw: null, unsaved: 0, unsavedLabels: [], terms: [], archives: [] };
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(patch: Partial<PlanSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }
  /** The newest plan an earlier release left for this term, if this one has none. */
  private readLegacy(): string | null {
    for (const key of legacyKeysFor(this.payload.term.id)) {
      const value = this.persistence.read(key);
      if (value !== null) return value;
    }
    return null;
  }
  private readCurrent(): { raw: string | null; document: PlanDocument } {
    const raw = this.persistence.read(this.key);
    const source = raw ?? this.readLegacy();
    return { raw, document: source !== null ? decodePlan(source, this.payload).document : emptyDocument(this.payload) };
  }
  load = () => {
    if (this.snapshot.ready) return;
    this.refresh();
  };
  refresh = () => {
    // Keep unsaved edits recoverable. A retry compares the on-disk baseline
    // before it may replace anything changed by a different tab.
    if (this.dirty || this.snapshot.status === "saving") return;
    try {
      const latest = this.readCurrent();
      this.baseRaw = latest.raw;
      this.publish({ document: latest.document, ready: true, status: "saved", error: null, recoveryRaw: null });
    } catch (error) {
      let recoveryRaw: string | null = null;
      try { recoveryRaw = this.persistence.read(this.key) ?? this.readLegacy(); } catch { /* storage itself may be blocked */ }
      this.publish({ ready: true, status: "error", error: error instanceof Error ? error.message : "อ่านแผนไม่สำเร็จ", recoveryRaw });
    }
  };

  mutate = (mutation: Mutation): Promise<boolean> => {
    const next = this.queue.then(() => this.perform(mutation));
    this.queue = next.catch(() => undefined);
    return next;
  };

  private async perform(mutation: Mutation): Promise<boolean> {
    if (!this.snapshot.ready) { this.publish({ error: "กำลังโหลดแผน กรุณารอสักครู่" }); return false; }
    if (this.snapshot.recoveryRaw !== null) { this.publish({ error: "ข้อมูลเดิมต้องกู้คืนหรือสำรองก่อนเริ่มแผนใหม่" }); return false; }
    this.publish({ status: "saving", error: null });
    let before: PlanDocument | undefined;
    let candidate: PlanDocument | undefined;
    try {
      return await this.persistence.exclusive(this.key, async () => {
        const latest = this.readCurrent();
        if (this.dirty && latest.raw !== this.baseRaw) throw new Error("มีการแก้แผนจากแท็บอื่นระหว่างที่บันทึกไม่ได้ กรุณาสำรองงานแล้วโหลดแผนล่าสุด");
        before = this.dirty ? this.snapshot.document : latest.document;
        this.baseRaw = latest.raw;
        const data = await mutation(before);
        const proposed = { ...before, ...data, version: 5, termId: this.payload.term.id, dataset: this.payload.dataset,
          seedRevision: this.payload.seedRevision, revision: before.revision + 1, editedAt: new Date().toISOString() };
        // Commands and imported backups pass the same schema boundary.
        candidate = decodePlan(JSON.stringify(proposed), this.payload).document;
        const raw = JSON.stringify(candidate);
        this.persistence.write(this.key, raw);
        this.baseRaw = raw;
        this.dirty = false;
        this.publish({ document: candidate, status: "saved", error: null });
        return true;
      });
    } catch (error) {
      // Preserve a validated candidate if writing failed. A rule rejection or
      // a stale revision never replaces the currently displayed document.
      if (candidate && before) {
        this.dirty = true;
        this.publish({ document: candidate });
      }
      this.publish({ status: candidate || !before || this.dirty ? "error" : "saved", error: error instanceof Error ? error.message : "บันทึกไม่สำเร็จ กรุณาสำรองแผน" });
      return false;
    }
  }

  retry = async (): Promise<boolean> => {
    if (!this.dirty) { this.refresh(); return this.snapshot.status === "saved"; }
    return this.mutate((document) => document);
  };

  /**
   * Nothing to send: a plan kept in this browser is already written.
   *
   * Both stores answer the same calls so the board can offer the same two
   * buttons without asking which plan it is looking at — here they are simply
   * never reachable, because `unsaved` stays at zero.
   */
  save = (): Promise<boolean> => Promise.resolve(true);
  discard = (): Promise<boolean> => Promise.resolve(true);

  replace = (data: PlanData, expectedRevision: number): Promise<boolean> => this.mutate((current) => {
    if (current.revision !== expectedRevision) throw new Error("แผนมีการเปลี่ยนแปลง กรุณาตรวจแผนล่าสุดก่อนแทนที่");
    return data;
  });

  /** Called only after the recovery panel offers the original bytes as a backup. */
  recoverEmpty = async (): Promise<boolean> => {
    const expected = this.snapshot.recoveryRaw;
    const next = this.queue.then(() => this.persistence.exclusive(this.key, async () => {
      const raw = this.persistence.read(this.key);
      const source = raw ?? this.readLegacy();
      if (source !== expected) throw new Error("ข้อมูลเปลี่ยนแล้ว กรุณาโหลดใหม่ก่อนกู้คืน");
      const document = { ...emptyDocument(this.payload), revision: 1, editedAt: new Date().toISOString() };
      const encoded = JSON.stringify(document);
      this.persistence.write(this.key, encoded);
      this.baseRaw = encoded; this.dirty = false;
      this.publish({ document, ready: true, status: "saved", error: null, recoveryRaw: null });
      return true;
    })).catch((error: unknown) => {
      this.publish({ status: "error", error: error instanceof Error ? error.message : "กู้คืนไม่สำเร็จ" });
      return false;
    });
    this.queue = next;
    return next;
  };

  /** Explicit discard, after the UI offers a backup; never done by a storage event. */
  reload = () => { this.dirty = false; this.publish({ status: "loading" }); this.refresh(); };
  reportError = (error: string) => this.publish({ error });
}

export function browserPersistence(): Persistence {
  return {
    read: (key) => window.localStorage.getItem(key),
    write: (key, value) => window.localStorage.setItem(key, value),
    exclusive: async (name, work) => {
      if (!navigator.locks) throw new Error("เบราว์เซอร์นี้บันทึกข้ามแท็บอย่างปลอดภัยไม่ได้ กรุณาเปิดผ่าน HTTPS ในเบราว์เซอร์รุ่นปัจจุบัน");
      return navigator.locks.request(name, work);
    },
  };
}
