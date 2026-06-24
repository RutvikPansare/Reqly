import { HttpResponse, CollectionRequest } from '../types/index.js';

export interface HistoryEntry {
  id: string;
  timestamp: number;
  method: string;
  url: string;
  status: number;
  latency: number;
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
    const entry: HistoryEntry = {
      id: `h-${Date.now()}-${this.counter++}`,
      timestamp: Date.now(),
      method: req.method,
      url: req.url,
      status: res.status,
      latency: res.latency,
      requestName: req.name,
      collectionName: meta.collectionName
    };

    this.entries.unshift(entry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(0, MAX_ENTRIES);
    }
    return entry;
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
