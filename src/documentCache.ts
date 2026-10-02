export type CachedResource<T = unknown> = {
  data: T | null;
  error: string;
  loading: boolean;
  expiresAt: number;
  revision: number;
};
const empty: CachedResource = {
  data: null,
  error: "",
  loading: false,
  expiresAt: 0,
  revision: 0,
};
type Entry = {
  snapshot: CachedResource;
  controller?: AbortController;
  promise?: Promise<unknown>;
};

/** Per-user, memory-only cache. Never persists private documents to browser storage. */
export class DocumentCache {
  private entries = new Map<string, Entry>();
  private listeners = new Map<string, Set<() => void>>();
  private queue = new Map<string, number>();
  private running = 0;
  private disposed = false;
  private loader: (path: string, signal: AbortSignal) => Promise<unknown>;
  private now: () => number;

  constructor(
    loader: (path: string, signal: AbortSignal) => Promise<unknown>,
    now = Date.now,
  ) {
    this.loader = loader;
    this.now = now;
  }

  get<T>(path: string | null): CachedResource<T> {
    return (
      path ? this.entries.get(path)?.snapshot || empty : empty
    ) as CachedResource<T>;
  }

  subscribe(path: string, listener: () => void) {
    const listeners = this.listeners.get(path) || new Set();
    listeners.add(listener);
    this.listeners.set(path, listeners);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) this.listeners.delete(path);
    };
  }

  private emit(path: string) {
    this.listeners.get(path)?.forEach((listener) => listener());
  }

  async load(path: string, ttl = 60_000): Promise<unknown> {
    if (this.disposed) return;
    let entry = this.entries.get(path);
    if (entry?.promise) return entry.promise;
    if (entry && entry.snapshot.expiresAt > this.now())
      return entry.snapshot.data;
    entry ||= { snapshot: empty };
    this.entries.set(path, entry);
    const current = entry;
    const controller = new AbortController();
    current.controller = controller;
    current.snapshot = { ...current.snapshot, loading: true, error: "" };
    const revision = current.snapshot.revision;
    const valid = () =>
      !this.disposed &&
      !controller.signal.aborted &&
      this.entries.get(path) === current &&
      current.snapshot.revision === revision;
    current.promise = Promise.resolve()
      .then(() => this.loader(path, controller.signal))
      .then((data) => {
        if (valid())
          current.snapshot = {
            data,
            error: "",
            loading: false,
            revision,
            expiresAt: this.now() + ttl,
          };
        return data;
      })
      .catch((error) => {
        if (valid())
          current.snapshot = {
            ...current.snapshot,
            // Access loss must not leave a cached private document visible.
            data: [401, 403, 404].includes(error.status)
              ? null
              : current.snapshot.data,
            loading: false,
            error: error.message || "Не удалось загрузить документ.",
            expiresAt: 0,
          };
        throw error;
      })
      .finally(() => {
        if (valid()) {
          current.promise = undefined;
          current.controller = undefined;
          this.emit(path);
          this.trim();
        }
      });
    this.emit(path);
    return current.promise;
  }

  update<T>(path: string, change: (data: T) => T) {
    const entry = this.entries.get(path);
    if (!entry?.snapshot.data || this.disposed) return;
    entry.controller?.abort();
    entry.controller = undefined;
    entry.promise = undefined;
    entry.snapshot = {
      ...entry.snapshot,
      data: change(entry.snapshot.data as T),
      loading: false,
      error: "",
      expiresAt: 0,
      revision: entry.snapshot.revision + 1,
    };
    this.emit(path);
  }

  invalidate(prefix: string, exact = false) {
    for (const [path, entry] of this.entries) {
      if (exact ? path !== prefix : !path.startsWith(prefix)) continue;
      entry.controller?.abort();
      entry.controller = undefined;
      entry.promise = undefined;
      entry.snapshot = {
        ...entry.snapshot,
        loading: false,
        expiresAt: 0,
        revision: entry.snapshot.revision + 1,
      };
      this.emit(path);
    }
  }

  prefetch(path: string, ttl = 60_000) {
    if (this.disposed || this.get(path).expiresAt > this.now()) return;
    this.queue.set(path, ttl);
    this.drain();
  }

  private drain() {
    while (!this.disposed && this.running < 2 && this.queue.size) {
      const [path, ttl] = this.queue.entries().next().value!;
      this.queue.delete(path);
      this.running++;
      void this.load(path, ttl)
        .catch(() => {
          // Background errors are retained in the snapshot and shown on opening.
        })
        .finally(() => {
          this.running--;
          this.drain();
        });
    }
  }

  private trim() {
    for (const [path, entry] of this.entries) {
      if (this.entries.size <= 120) break;
      if (!entry.promise && !this.listeners.has(path))
        this.entries.delete(path);
    }
  }

  dispose() {
    this.disposed = true;
    this.queue.clear();
    for (const entry of this.entries.values()) entry.controller?.abort();
    this.entries.clear();
    this.listeners.clear();
  }
}
