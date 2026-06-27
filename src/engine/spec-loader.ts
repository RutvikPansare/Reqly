import * as fs from 'fs';
import SwaggerParser from 'swagger-parser';

// Loads and dereferences OpenAPI 3.0 / Swagger 2.0 specs from a local file path
// or a remote URL, caching the result in memory keyed by the source. Local
// files can be watched for hot-reload; remote specs are fetched once until
// reload() is called.
export class SpecLoader {
  private cache: Map<string, any> = new Map();
  private watchers: Map<string, fs.FSWatcher> = new Map();

  async load(source: string): Promise<any> {
    const cached = this.cache.get(source);
    if (cached) return cached;
    return this.reload(source);
  }

  // Forces a re-parse/re-fetch, replacing the cached value.
  async reload(source: string): Promise<any> {
    // SwaggerParser.dereference mutates/returns a fully resolved document and
    // accepts both file paths and URLs.
    const spec = await (SwaggerParser as any).dereference(source);
    this.cache.set(source, spec);
    return spec;
  }

  get(source: string): any | undefined {
    return this.cache.get(source);
  }

  // Watch a local spec file; re-parses into the cache on change.
  watch(source: string, onChange?: () => void): void {
    if (this.watchers.has(source)) return;
    if (!isLocalPath(source) || !fs.existsSync(source)) return;
    const watcher = fs.watch(source, () => {
      this.reload(source).then(() => onChange?.()).catch(() => {});
    });
    this.watchers.set(source, watcher);
  }

  stopWatching(source?: string): void {
    if (source) {
      this.watchers.get(source)?.close();
      this.watchers.delete(source);
      return;
    }
    for (const w of this.watchers.values()) w.close();
    this.watchers.clear();
  }

  clear(source: string): void {
    this.stopWatching(source);
    this.cache.delete(source);
  }
}

function isLocalPath(source: string): boolean {
  return !/^https?:\/\//i.test(source);
}
