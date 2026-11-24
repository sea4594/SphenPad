/** Creator-only serialized, coalescing background persistence. The shared storage and sync path is unchanged. */
export type CreatorSaveSnapshot<T> = { revision: number; value: T };
export type CreatorSaveStatus = { latestRevision: number; savedRevision: number; saving: boolean; error: boolean };

export class CreatorSaveCoordinator<T> {
  private latest: CreatorSaveSnapshot<T> | null = null;
  private pending: CreatorSaveSnapshot<T> | null = null;
  private running: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private revision = 0;
  private savedRevision = 0;
  private failed = false;
  private readonly write: (value: T) => Promise<unknown>;
  private readonly delayMs: number;
  private listeners = new Set<(status: CreatorSaveStatus) => void>();

  constructor(write: (value: T) => Promise<unknown>, delayMs = 700) {
    this.write = write;
    this.delayMs = delayMs;
  }

  getStatus(): CreatorSaveStatus {
    return { latestRevision: this.revision, savedRevision: this.savedRevision, saving: this.running !== null, error: this.failed };
  }

  /** Only return a draft when it has not yet been persisted, including one currently in flight. */
  getUncommitted(): T | null {
    return this.latest && this.latest.revision > this.savedRevision ? this.latest.value : null;
  }

  subscribe(listener: (status: CreatorSaveStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => { this.listeners.delete(listener); };
  }

  private notify() { const status = this.getStatus(); for (const listener of this.listeners) listener(status); }
  private cancelTimer() { if (this.timer !== null) clearTimeout(this.timer); this.timer = null; }

  enqueue(value: T): number {
    const snapshot = { revision: ++this.revision, value };
    this.latest = snapshot;
    this.pending = snapshot; // Older unsent revisions are intentionally coalesced.
    this.failed = false;
    this.cancelTimer();
    this.timer = setTimeout(() => { void this.flush().catch(() => { /* status remains visible; retry on next edit or explicit save */ }); }, this.delayMs);
    this.notify();
    return snapshot.revision;
  }

  private start(): Promise<void> {
    if (this.running) return this.running;
    const job = this.drain();
    this.running = job;
    this.notify();
    void job.then(() => { if (this.running === job) { this.running = null; this.notify(); } }, () => {
      if (this.running === job) { this.running = null; this.notify(); }
    });
    return job;
  }

  private async drain() {
    while (this.pending) {
      const snapshot = this.pending;
      this.pending = null;
      try {
        await this.write(snapshot.value);
        this.savedRevision = Math.max(this.savedRevision, snapshot.revision);
        if (this.latest?.revision === snapshot.revision) this.latest = null;
        this.failed = false;
        this.notify();
      } catch (error) {
        // Never replace a newer edit with a failed, older in-flight snapshot.
        const newest = this.latest;
        this.pending = newest && newest.revision > snapshot.revision ? newest : snapshot;
        this.failed = true;
        this.notify();
        throw error;
      }
    }
  }

  /** Wait for in-flight writes and the latest queued revision; never start concurrent writes. */
  async flush(): Promise<number> {
    this.cancelTimer();
    while (this.pending || this.running) await this.start();
    return this.savedRevision;
  }
}
