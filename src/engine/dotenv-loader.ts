import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'dotenv';
import chokidar, { FSWatcher } from 'chokidar';
import { SecretProviderRegistry } from './secret-providers/index.js';

export interface DotEnvVariable {
  key: string;
  value: string;
  source: string;
  secret?: boolean;
  error?: string;
}

export interface DotEnvSecretError {
  key: string;
  uri: string;
  source: string;
  error: string;
}

export interface DotEnvSecretStatus {
  key: string;
  uri: string;
  source: string;
  status: 'resolved' | 'error';
  error?: string;
}

interface StoreEntry {
  value: string;
  source: string;
  // Set when the raw .env value was a vault URI. `value` then holds the
  // resolved secret (status resolved) or the raw URI (status error).
  secretUri?: string;
  secretError?: string;
}

function maskSecret(value: string): string {
  return value.slice(0, 4) + '...';
}

// Loads variables from one or more .env-style files without touching
// process.env (each project gets its own isolated store). Files are loaded in
// order; a later file wins on key collision - standard dotenv convention.
// Missing files are silently skipped so `.env` is zero-config by default.
//
// When a SecretProviderRegistry is attached, values matching a known vault URI
// prefix (op://, vault://, aws://, bw://) are resolved through it at load time.
// Failed resolutions are excluded from getVariablesRecord() and surfaced via
// getSecretErrors() - the executor fails loudly when a request references a
// failed key, and the UI/CLI/MCP report the error. Never an empty string.
export class DotEnvLoader {
  private store: Map<string, StoreEntry> = new Map();
  private watchers: FSWatcher[] = [];

  constructor(
    private baseDir: string,
    private files: string[] = ['.env'],
    private secretRegistry?: SecretProviderRegistry
  ) {}

  getFiles(): string[] {
    return this.files;
  }

  setFiles(files: string[]): void {
    this.files = files;
  }

  async load(): Promise<void> {
    const next = new Map<string, StoreEntry>();
    for (const file of this.files) {
      const filePath = path.join(this.baseDir, file);
      if (!fs.existsSync(filePath)) continue;
      const content = fs.readFileSync(filePath, 'utf8');
      const parsed = parse(content);
      for (const [key, value] of Object.entries(parsed)) {
        next.set(key, { value, source: file });
      }
    }

    if (this.secretRegistry) {
      // Resolve each distinct URI once per load - multiple keys can share one URI.
      const uriResults = new Map<string, Promise<string>>();
      const pending: Promise<void>[] = [];
      for (const entry of next.values()) {
        if (!this.secretRegistry.isSecretUri(entry.value)) continue;
        const uri = entry.value;
        entry.secretUri = uri;
        if (!uriResults.has(uri)) {
          uriResults.set(uri, this.secretRegistry.resolve(uri));
        }
        pending.push(
          uriResults.get(uri)!.then(
            resolved => { entry.value = resolved; },
            (err: any) => { entry.secretError = err?.message || String(err); }
          )
        );
      }
      await Promise.all(pending);
    }

    this.store = next;
  }

  getVariables(): DotEnvVariable[] {
    return [...this.store.entries()].map(([key, entry]) => {
      if (entry.secretUri && !entry.secretError) {
        // Resolved secret: mask in the display/listing path. The full value
        // only flows through getVariablesRecord() into request execution.
        return { key, value: maskSecret(entry.value), source: entry.source, secret: true };
      }
      if (entry.secretError) {
        return { key, value: entry.secretUri!, source: entry.source, secret: true, error: entry.secretError };
      }
      return { key, value: entry.value, source: entry.source };
    });
  }

  getVariablesRecord(): Record<string, string> {
    const record: Record<string, string> = {};
    for (const [key, entry] of this.store.entries()) {
      if (entry.secretError) continue; // never inject a failed secret (or its raw URI) into requests
      record[key] = entry.value;
    }
    return record;
  }

  getSecretErrors(): DotEnvSecretError[] {
    const errors: DotEnvSecretError[] = [];
    for (const [key, entry] of this.store.entries()) {
      if (entry.secretUri && entry.secretError) {
        errors.push({ key, uri: entry.secretUri, source: entry.source, error: entry.secretError });
      }
    }
    return errors;
  }

  // One row per vault URI found in the loaded files, for the Settings ->
  // Secrets UI and the get_secret_status MCP tool. Values never appear here.
  getSecretStatus(): DotEnvSecretStatus[] {
    const status: DotEnvSecretStatus[] = [];
    for (const [key, entry] of this.store.entries()) {
      if (!entry.secretUri) continue;
      status.push(
        entry.secretError
          ? { key, uri: entry.secretUri, source: entry.source, status: 'error', error: entry.secretError }
          : { key, uri: entry.secretUri, source: entry.source, status: 'resolved' }
      );
    }
    return status;
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
