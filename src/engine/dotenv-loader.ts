import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'dotenv';
import chokidar, { FSWatcher } from 'chokidar';

export interface DotEnvVariable {
  key: string;
  value: string;
  source: string;
}

// Loads variables from one or more .env-style files without touching
// process.env (each project gets its own isolated store). Files are loaded in
// order; a later file wins on key collision - standard dotenv convention.
// Missing files are silently skipped so `.env` is zero-config by default.
export class DotEnvLoader {
  private store: Map<string, { value: string; source: string }> = new Map();
  private watchers: FSWatcher[] = [];

  constructor(private baseDir: string, private files: string[] = ['.env']) {}

  getFiles(): string[] {
    return this.files;
  }

  setFiles(files: string[]): void {
    this.files = files;
  }

  async load(): Promise<void> {
    const next = new Map<string, { value: string; source: string }>();
    for (const file of this.files) {
      const filePath = path.join(this.baseDir, file);
      if (!fs.existsSync(filePath)) continue;
      const content = fs.readFileSync(filePath, 'utf8');
      const parsed = parse(content);
      for (const [key, value] of Object.entries(parsed)) {
        next.set(key, { value, source: file });
      }
    }
    this.store = next;
  }

  getVariables(): DotEnvVariable[] {
    return [...this.store.entries()].map(([key, { value, source }]) => ({ key, value, source }));
  }

  getVariablesRecord(): Record<string, string> {
    const record: Record<string, string> = {};
    for (const [key, { value }] of this.store.entries()) {
      record[key] = value;
    }
    return record;
  }

  // Watches every loaded file for changes and re-loads on each event.
  // No-op for files that don't exist yet (consistent with the load-skip rule).
  watch(onChange?: () => void): void {
    this.stopWatching();
    for (const file of this.files) {
      const filePath = path.join(this.baseDir, file);
      if (!fs.existsSync(filePath)) continue;
      const watcher = chokidar.watch(filePath, { persistent: false }).on('change', () => {
        this.load().then(() => onChange?.());
      });
      this.watchers.push(watcher);
    }
  }

  stopWatching(): void {
    for (const w of this.watchers) w.close();
    this.watchers = [];
  }
}
