import { HttpResponse, CollectionRequest } from '../types/index.js';

const BODY_DIFF_LIMIT = 10 * 1024; // 10 KB - enough for meaningful diffs

export interface HistoryEntry {
  id: string;
  timestamp: number;
  method: string;
  url: string;
  status: number;
  latency: number;
  body?: string;
  requestName?: string;
  collectionName?: string;
}

interface AppendMeta {
  collectionName?: string;
}

const MAX_ENTRIES = 200;

export class HistoryStore {
  private entries: HistoryEntry[] = [];
  private counter = 0;

  public append(req: CollectionRequest, res: HttpResponse, meta: AppendMeta = {}): HistoryEntry {
    let body: string | undefined;
    if (res.body !== null && res.body !== undefined) {
      const raw = typeof res.body === 'object' ? JSON.stringify(res.body) : String(res.body);
      body = raw.length > BODY_DIFF_LIMIT ? raw.slice(0, BODY_DIFF_LIMIT) : raw;
    }

    const entry: HistoryEntry = {
      id: `h-${Date.now()}-${this.counter++}`,
      timestamp: Date.now(),
      method: req.method,
      url: req.url,
      status: res.status,
      latency: res.latency,
      body,
      requestName: req.name,
      collectionName: meta.collectionName
    };

    this.entries.unshift(entry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(0, MAX_ENTRIES);
    }
    return entry;
  }

  /** Returns the two most recent entries for a given request name (newest first). */
  public getLastTwo(requestName: string): HistoryEntry[] {
    return this.entries.filter(e => e.requestName === requestName).slice(0, 2);
  }

  public list(): HistoryEntry[] {
    return [...this.entries];
  }

  public get(id: string): HistoryEntry | undefined {
    return this.entries.find(e => e.id === id);
  }

  public clear(): void {
    this.entries = [];
  }
}
