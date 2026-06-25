import * as fs from 'fs/promises';
import * as path from 'path';
import { CollectionRequest, HttpMethod } from '../types/index.js';
import { CollectionManager } from './collection-manager.js';

export interface ImportResult {
  collectionName: string;
  requestsImported: number;
}

// ── Bruno block parser ──────────────────────────────────────────────────────
// Parses the .bru text format into named blocks. Block names may contain
// colons (e.g. body:json). Content between the outer braces is captured
// verbatim so nested JSON braces are preserved correctly.

function parseBrunoBlocks(content: string): Record<string, string> {
  const blocks: Record<string, string> = {};
  let pos = 0;

  while (pos < content.length) {
    // skip whitespace / blank lines
    while (pos < content.length && /\s/.test(content[pos])) pos++;
    if (pos >= content.length) break;

    // skip comment lines
    if (content[pos] === '#') {
      while (pos < content.length && content[pos] !== '\n') pos++;
      continue;
    }

    // read block name: word chars and colons (e.g. "body:json")
    const nameStart = pos;
    while (pos < content.length && /[\w:]/.test(content[pos])) pos++;
    const blockName = content.slice(nameStart, pos);
    if (!blockName) { pos++; continue; }

    // skip to opening brace (stop at newline - this line has no block)
    while (pos < content.length && content[pos] !== '{' && content[pos] !== '\n') pos++;
    if (pos >= content.length || content[pos] !== '{') continue;
    pos++; // consume '{'

    // collect content until the matching closing '}'
    let depth = 1;
    const blockStart = pos;
    while (pos < content.length && depth > 0) {
      if (content[pos] === '{') depth++;
      else if (content[pos] === '}') depth--;
      if (depth > 0) pos++;
      else break;
    }

    blocks[blockName] = content.slice(blockStart, pos).trim();
    pos++; // consume closing '}'
  }

  return blocks;
}

// Parses simple "key: value" lines. Splits on the first colon only so
// URLs (which contain colons) are preserved intact as values.
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
      // folder - flatten recursively
      requests.push(...flattenPostmanItems(item.item));
    } else if (item.request) {
      const req = item.request;
      const { url, params } = parsePostmanUrl(req.url);
      const headers = parsePostmanHeaders(req.header ?? []);
      const body: string | undefined = req.body?.raw || undefined;
      const method = ((req.method as string) ?? 'GET').toUpperCase() as HttpMethod;
      const name = ((item.name as string) ?? 'Request')
        .replace(/[/\\:*?"<>|]/g, '-')
        .slice(0, 50)
        .trim();

      const cr: CollectionRequest = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name,
        method,
        url,
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

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

export function parseBruno(
  content: string,
  defaultName?: string
): { requestName: string; request: CollectionRequest } {
  const blocks = parseBrunoBlocks(content);

  const metaKv = parseKv(blocks['meta'] ?? '');
  const requestName = metaKv['name'] || defaultName || 'Request';

  let method: HttpMethod = 'GET';
  let url = '';
  for (const m of HTTP_METHODS) {
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
    name: requestName,
    method,
    url,
  };
  if (headers) request.headers = headers;
  if (params) request.params = params;
  if (body) request.body = body;

  return { requestName, request };
}

// ── Shared writer ────────────────────────────────────────────────────────────

async function persistRequests(
  collectionName: string,
  requests: CollectionRequest[],
  manager: CollectionManager
): Promise<void> {
  await manager.createCollection(collectionName);
  for (const req of requests) {
    await manager.addRequest(collectionName, req);
  }
}

// ── File-based import (CLI and MCP tool) ─────────────────────────────────────

export async function importFromFile(
  sourcePath: string,
  format: 'postman' | 'bruno',
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
// The browser reads the file and sends its contents as a string. Format is
// detected from the file extension before the request is made.

export async function importFromContent(
  content: string,
  format: 'postman' | 'bruno',
  manager: CollectionManager,
  collectionName?: string
): Promise<ImportResult> {
  if (format === 'postman') {
    const parsed = parsePostman(content);
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
