import * as fs from 'fs/promises';
import * as path from 'path';
import { CollectionRequest, HttpMethod } from '../types/index.js';
import { CollectionManager } from './collection-manager.js';

export interface ImportResult {
  collectionName: string;
  requestsImported: number;
}

// ── Bruno block parser ──────────────────────────────────────────────────────

function parseBrunoBlocks(content: string): Record<string, string> {
  const blocks: Record<string, string> = {};
  let pos = 0;
  while (pos < content.length) {
    while (pos < content.length && /\s/.test(content[pos])) pos++;
    if (pos >= content.length) break;
    if (content[pos] === '#') {
      while (pos < content.length && content[pos] !== '\n') pos++;
      continue;
    }
    const nameStart = pos;
    while (pos < content.length && /[\w:]/.test(content[pos])) pos++;
    const blockName = content.slice(nameStart, pos);
    if (!blockName) { pos++; continue; }
    while (pos < content.length && content[pos] !== '{' && content[pos] !== '\n') pos++;
    if (pos >= content.length || content[pos] !== '{') continue;
    pos++;
    let depth = 1;
    const blockStart = pos;
    while (pos < content.length && depth > 0) {
      if (content[pos] === '{') depth++;
      else if (content[pos] === '}') depth--;
      if (depth > 0) pos++;
      else break;
    }
    blocks[blockName] = content.slice(blockStart, pos).trim();
    pos++;
  }
  return blocks;
}

function parseKv(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;
    const key = trimmed.slice(0, colonIdx).trim();
    const value = trimmed.slice(colonIdx + 1).trim();
    if (key) result[key] = value;
  }
  return result;
}

// ── Postman v2.1 parser ─────────────────────────────────────────────────────

function parsePostmanUrl(url: unknown): { url: string; params?: Record<string, string> } {
  if (typeof url === 'string') return { url };
  const u = url as any;
  const raw: string = u?.raw ?? '';
  const params: Record<string, string> = {};
  for (const q of u?.query ?? []) {
    if (!q.disabled && q.key) params[q.key] = q.value ?? '';
  }
  return { url: raw, params: Object.keys(params).length ? params : undefined };
}

function parsePostmanHeaders(headers: any[]): Record<string, string> | undefined {
  if (!headers?.length) return undefined;
  const result: Record<string, string> = {};
  for (const h of headers) {
    if (!h.disabled && h.key) result[h.key] = h.value ?? '';
  }
  return Object.keys(result).length ? result : undefined;
}

function flattenPostmanItems(items: any[]): CollectionRequest[] {
  const requests: CollectionRequest[] = [];
  for (const item of items) {
    if (Array.isArray(item.item)) {
      requests.push(...flattenPostmanItems(item.item));
    } else if (item.request) {
      const req = item.request;
      const { url, params } = parsePostmanUrl(req.url);
      const headers = parsePostmanHeaders(req.header ?? []);
      const body: string | undefined = req.body?.raw || undefined;
      const method = ((req.method as string) ?? 'GET').toUpperCase() as HttpMethod;
      const name = sanitizeName((item.name as string) ?? 'Request');
      const cr: CollectionRequest = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name, method, url,
      };
      if (headers) cr.headers = headers;
      if (params) cr.params = params;
      if (body) cr.body = body;
      requests.push(cr);
    }
  }
  return requests;
}

export function parsePostman(content: string): { collectionName: string; requests: CollectionRequest[] } {
  const data = JSON.parse(content);
  const collectionName = (data.info?.name as string) || 'Imported';
  const requests = flattenPostmanItems(data.item ?? []);
  return { collectionName, requests };
}

// ── Bruno parser ─────────────────────────────────────────────────────────────

const BRUNO_HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

export function parseBruno(
  content: string,
  defaultName?: string
): { requestName: string; request: CollectionRequest } {
  const blocks = parseBrunoBlocks(content);
  const metaKv = parseKv(blocks['meta'] ?? '');
  const requestName = metaKv['name'] || defaultName || 'Request';
  let method: HttpMethod = 'GET';
  let url = '';
  for (const m of BRUNO_HTTP_METHODS) {
    if (blocks[m] !== undefined) {
      method = m.toUpperCase() as HttpMethod;
      const kv = parseKv(blocks[m]);
      url = kv['url'] ?? '';
      break;
    }
  }
  let headers: Record<string, string> | undefined;
  if (blocks['headers']) {
    const kv = parseKv(blocks['headers']);
    if (Object.keys(kv).length) headers = kv;
  }
  let params: Record<string, string> | undefined;
  if (blocks['query']) {
    const kv = parseKv(blocks['query']);
    if (Object.keys(kv).length) params = kv;
  }
  let body: string | undefined;
  if (blocks['body:json']) {
    const raw = blocks['body:json'].trim();
    if (raw) body = raw;
  }
  const request: CollectionRequest = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: requestName, method, url,
  };
  if (headers) request.headers = headers;
  if (params) request.params = params;
  if (body) request.body = body;
  return { requestName, request };
}

// ── Insomnia v4 parser ───────────────────────────────────────────────────────

function sanitizeName(name: string): string {
  // Strip path-unsafe characters, cap length, and guarantee a non-empty result:
  // an empty name is rejected by CollectionManager (path-safety guard).
  const cleaned = (name || 'Request').replace(/[/\\:*?"<>|]/g, '-').slice(0, 50).trim();
  return cleaned || 'Request';
}

export function parseInsomnia(content: string): { collectionName: string; requests: CollectionRequest[] } {
  const data = JSON.parse(content);
  const resources: any[] = data.resources ?? [];
  const workspace = resources.find((r: any) => r._type === 'workspace');
  const collectionName = workspace?.name || 'Imported';
  const requests: CollectionRequest[] = [];
  for (const r of resources) {
    if (r._type !== 'request') continue;
    const method = ((r.method as string) ?? 'GET').toUpperCase() as HttpMethod;
    const url: string = r.url ?? '';
    const name = sanitizeName(r.name);
    const headers: Record<string, string> = {};
    for (const h of r.headers ?? []) {
      if (h.name && !h.disabled) headers[h.name] = h.value ?? '';
    }
    let body: string | undefined;
    if (r.body?.text) body = r.body.text;
    const cr: CollectionRequest = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name, method, url,
    };
    if (Object.keys(headers).length) cr.headers = headers;
    if (body) cr.body = body;
    requests.push(cr);
  }
  return { collectionName, requests };
}

// ── OpenAPI 3.0 / Swagger 2.0 parser ────────────────────────────────────────

const OPENAPI_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'] as const;

function parseScalar(s: string): any {
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null' || s === '~') return null;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function parseSimpleYaml(content: string): any {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const root: any = {};
  const stack: Array<{ obj: any; indent: number }> = [{ obj: root, indent: -1 }];
  for (const raw of lines) {
    if (/^\s*#/.test(raw) || /^\s*$/.test(raw)) continue;
    const indent = raw.search(/\S/);
    const line = raw.trimStart();
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
    const parent = stack[stack.length - 1].obj;
    if (line.startsWith('- ')) {
      const val = line.slice(2).trim();
      if (Array.isArray(parent)) parent.push(parseScalar(val));
      continue;
    }
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const rest = line.slice(colonIdx + 1).trim();
    if (!key) continue;
    if (!rest || rest === '|' || rest === '>') {
      const child: any = {};
      if (Array.isArray(parent)) parent.push(child);
      else parent[key] = child;
      stack.push({ obj: child, indent });
    } else {
      const val = parseScalar(rest);
      if (Array.isArray(parent)) parent.push({ [key]: val });
      else parent[key] = val;
    }
  }
  return root;
}

function tryParseYamlOrJson(content: string): any {
  try { return JSON.parse(content); } catch { /* fall through to YAML */ }
  return parseSimpleYaml(content);
}

export function parseOpenApi(content: string): { collectionName: string; requests: CollectionRequest[] } {
  const spec = tryParseYamlOrJson(content);
  const collectionName: string = spec.info?.title || 'Imported';
  const requests: CollectionRequest[] = [];

  let baseUrl = '';
  if (spec.openapi) {
    const server = (spec.servers ?? [])[0];
    baseUrl = server?.url ?? '';
  } else if (spec.swagger) {
    const host: string = spec.host ?? '';
    const basePath: string = spec.basePath ?? '';
    if (host) baseUrl = `https://${host}${basePath}`;
    else baseUrl = basePath;
  }

  const paths: Record<string, any> = spec.paths ?? {};
  for (const [pathKey, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    for (const method of OPENAPI_METHODS) {
      const op: any = (pathItem as any)[method];
      if (!op) continue;
      const name = sanitizeName(op.operationId ?? op.summary ?? `${method.toUpperCase()} ${pathKey}`);
      const url = baseUrl ? `${baseUrl}${pathKey}` : pathKey;
      requests.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name, method: method.toUpperCase() as HttpMethod, url,
      });
    }
  }
  return { collectionName, requests };
}

// ── Shared writer ────────────────────────────────────────────────────────────

async function persistRequests(
  collectionName: string,
  requests: CollectionRequest[],
  manager: CollectionManager
): Promise<void> {
  await manager.createCollection(collectionName);
  // addRequest is an upsert keyed by name, so same-named imports would silently
  // overwrite each other. Suffix collisions so every request is preserved.
  const usedNames = new Set<string>();
  for (const req of requests) {
    let name = req.name;
    if (usedNames.has(name)) {
      let suffix = 1;
      while (usedNames.has(`${req.name} (${suffix})`)) suffix++;
      name = `${req.name} (${suffix})`;
    }
    usedNames.add(name);
    await manager.addRequest(collectionName, { ...req, name });
  }
}

// ── File-based import ────────────────────────────────────────────────────────

export type ImportFormat = 'postman' | 'bruno' | 'insomnia' | 'openapi';

export async function importFromFile(
  sourcePath: string,
  format: ImportFormat,
  manager: CollectionManager
): Promise<ImportResult> {
  const stat = await fs.stat(sourcePath).catch(() => null);
  if (!stat) throw new Error(`File not found: ${sourcePath}`);

  if (format === 'postman') {
    const content = await fs.readFile(sourcePath, 'utf8');
    const { collectionName, requests } = parsePostman(content);
    await persistRequests(collectionName, requests, manager);
    return { collectionName, requestsImported: requests.length };
  }

  if (format === 'insomnia') {
    const content = await fs.readFile(sourcePath, 'utf8');
    const { collectionName, requests } = parseInsomnia(content);
    await persistRequests(collectionName, requests, manager);
    return { collectionName, requestsImported: requests.length };
  }

  if (format === 'openapi') {
    const content = await fs.readFile(sourcePath, 'utf8');
    const { collectionName, requests } = parseOpenApi(content);
    await persistRequests(collectionName, requests, manager);
    return { collectionName, requestsImported: requests.length };
  }

  // Bruno - directory of .bru files
  if (stat.isDirectory()) {
    const collectionName = path.basename(sourcePath);
    const files = (await fs.readdir(sourcePath)).filter(f => f.endsWith('.bru'));
    const requests: CollectionRequest[] = [];
    for (const file of files) {
      const content = await fs.readFile(path.join(sourcePath, file), 'utf8');
      const { request } = parseBruno(content, path.basename(file, '.bru'));
      requests.push(request);
    }
    await persistRequests(collectionName, requests, manager);
    return { collectionName, requestsImported: requests.length };
  }

  // Bruno - single .bru file
  const collectionName = path.basename(path.dirname(sourcePath));
  const content = await fs.readFile(sourcePath, 'utf8');
  const { request } = parseBruno(content, path.basename(sourcePath, '.bru'));
  await persistRequests(collectionName, [request], manager);
  return { collectionName, requestsImported: 1 };
}

// ── Content-based import (UI via Express) ────────────────────────────────────

export async function importFromContent(
  content: string,
  format: ImportFormat,
  manager: CollectionManager,
  collectionName?: string
): Promise<ImportResult> {
  if (format === 'postman') {
    const parsed = parsePostman(content);
    const name = collectionName || parsed.collectionName;
    await persistRequests(name, parsed.requests, manager);
    return { collectionName: name, requestsImported: parsed.requests.length };
  }

  if (format === 'insomnia') {
    const parsed = parseInsomnia(content);
    const name = collectionName || parsed.collectionName;
    await persistRequests(name, parsed.requests, manager);
    return { collectionName: name, requestsImported: parsed.requests.length };
  }

  if (format === 'openapi') {
    const parsed = parseOpenApi(content);
    const name = collectionName || parsed.collectionName;
    await persistRequests(name, parsed.requests, manager);
    return { collectionName: name, requestsImported: parsed.requests.length };
  }

  // Bruno single file
  const name = collectionName || 'Imported';
  const { request } = parseBruno(content, name);
  await persistRequests(name, [request], manager);
  return { collectionName: name, requestsImported: 1 };
}
