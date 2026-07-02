import * as fs from 'fs';
import * as path from 'path';
import { HttpResponse } from '../types/index.js';
import { extractBodyValue } from './assertion-runner.js';

export class ResponseStore {
  private store = new Map<string, HttpResponse>();
  private filePath?: string;
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor(projectDir?: string) {
    if (projectDir) {
      this.filePath = path.join(projectDir, '.reqly', 'responses.json');
      this.load();
    }
  }

  private load() {
    if (!this.filePath || !fs.existsSync(this.filePath)) return;
    try {
      const content = fs.readFileSync(this.filePath, 'utf8');
      const data = JSON.parse(content);
      for (const [k, v] of Object.entries(data)) {
        this.store.set(k, v as HttpResponse);
      }
    } catch (e) {
      // ignore
    }
  }

  private triggerSave() {
    if (!this.filePath) return;
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => {
      this.saveTimeout = null;
      try {
        const dir = path.dirname(this.filePath!);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        
        const data = Object.fromEntries(this.store.entries());
        fs.writeFileSync(this.filePath!, JSON.stringify(data, null, 2), 'utf8');
      } catch (e) {
        // ignore
      }
    }, 100);
  }

  public set(requestName: string, response: HttpResponse) {
    this.store.set(requestName, response);
    this.triggerSave();
  }

  public get(requestName: string): HttpResponse | undefined {
    return this.store.get(requestName);
  }

  public clear() {
    this.store.clear();
    if (this.filePath && fs.existsSync(this.filePath)) {
      try { fs.unlinkSync(this.filePath); } catch (e) {}
    }
  }

  public getValue(path: string): any {
    // path format: requestName.response.field[.subfield]
    // e.g. login.response.status
    // e.g. login.response.body.user.token
    const match = path.match(/^([^.]+)\.response\.(.+)$/);
    if (!match) return undefined;

    const [_, reqName, fieldPath] = match;
    const res = this.get(reqName);
    if (!res) return undefined;

    if (fieldPath === 'status') return res.status;
    if (fieldPath === 'latency') return res.latency;
    
    if (fieldPath.startsWith('body')) {
      const subPath = fieldPath.substring(5); // remove 'body.'
      if (!subPath) return res.body;
      return extractBodyValue(res.body, subPath);
    }
    
    if (fieldPath.startsWith('headers.')) {
      const headerName = fieldPath.substring(8);
      return res.headers[headerName] || res.headers[headerName.toLowerCase()];
    }

    return undefined;
  }
}
