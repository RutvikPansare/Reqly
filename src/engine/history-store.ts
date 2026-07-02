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
  requestType?: string;
}

interface AppendMeta {
  collectionName?: string;
}

const MAX_ENTRIES = 200;

import * as fs from 'fs';
import * as path from 'path';

export class HistoryStore {
  private entries: HistoryEntry[] = [];
  private counter = 0;
  private filePath?: string;

  constructor(projectDir?: string) {
    if (projectDir) {
      this.filePath = path.join(projectDir, '.reqly', 'history.ndjson');
      this.load();
    }
  }

  private load() {
    if (!this.filePath || !fs.existsSync(this.filePath)) return;
    try {
      const content = fs.readFileSync(this.filePath, 'utf8');
      const lines = content.split('\n').filter(Boolean);
      const parsed = lines.map(line => {
        try {
          return JSON.parse(line) as HistoryEntry;
        } catch {
          return null;
        }
      }).filter(Boolean) as HistoryEntry[];
      
      // new lines are at the bottom of the file, we want newest first in memory
      parsed.reverse();
      this.entries = parsed.slice(0, MAX_ENTRIES);
      
      // Initialize counter so ids don't collide in the same millisecond
      this.counter = this.entries.length;

      // Trim the file on disk if it has grown beyond MAX_ENTRIES to keep it bounded.
      // Write the MAX_ENTRIES most recent lines back (oldest-first, as the file format requires).
      if (lines.length > MAX_ENTRIES) {
        const trimmed = lines.slice(lines.length - MAX_ENTRIES).join('\n') + '\n';
        try {
          fs.writeFileSync(this.filePath, trimmed, 'utf8');
        } catch {
          // ignore trim errors - non-critical
        }
      }
    } catch (e) {
      // ignore read errors
    }
  }

  public reloadFromDisk() {
    this.load();
  }

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
      collectionName: meta.collectionName,
      requestType: (req as any).type,
    };

    this.entries.unshift(entry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(0, MAX_ENTRIES);
    }

    if (this.filePath) {
      try {
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.appendFileSync(this.filePath, JSON.stringify(entry) + '\n', 'utf8');
      } catch (e) {
        // ignore write errors (fire and forget)
      }
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
    if (this.filePath && fs.existsSync(this.filePath)) {
      try {
        fs.unlinkSync(this.filePath);
      } catch (e) {
        // ignore
      }
    }
  }
}
