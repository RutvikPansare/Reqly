import type { Collection, CollectionRequest } from '../types/index.js';

// ── Postman v2.1 export ──────────────────────────────────────────────────────

function toPostmanHeaders(headers?: Record<string, string>) {
  if (!headers) return [];
  return Object.entries(headers).map(([key, value]) => ({ key, value }));
}

function extractPath(url: string): string {
  try {
    return new URL(url).pathname || '/';
  } catch {
    // Not a full URL - treat as path
    const match = url.match(/^[^?#]*/);
    return match ? match[0] : url;
  }
}

function extractHost(url: string): string {
  try {
    const u = new URL(url);
    return u.protocol + '//' + u.host;
  } catch {
    return '';
  }
}

// Appends req.params to the raw URL as a query string, preserving any query
// already present in the URL.
function rawUrlWithParams(url: string, params?: Record<string, string>): string {
  const entries = Object.entries(params ?? {});
  if (entries.length === 0) return url;
  const qs = entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  return url + (url.includes('?') ? '&' : '?') + qs;
}

function toPostmanItem(req: CollectionRequest) {
  const paramEntries = Object.entries(req.params ?? {});
  const item: any = {
    name: req.name,
    request: {
      method: req.method,
      header: toPostmanHeaders(req.headers),
      url: {
        raw: rawUrlWithParams(req.url, req.params),
        host: [extractHost(req.url)],
        path: extractPath(req.url).split('/').filter(Boolean),
        // Query params live in req.params, not the raw URL - emit them so they
        // survive the round-trip (the importer reads url.query).
        ...(paramEntries.length ? { query: paramEntries.map(([key, value]) => ({ key, value })) } : {}),
      },
    },
    response: [],
  };

  if (req.body) {
    const raw = typeof req.body === 'object' ? JSON.stringify(req.body) : req.body;
    item.request.body = { mode: 'raw', raw };
  }

  return item;
}

export function exportToPostman(collection: Collection): string {
  const postman = {
    info: {
      name: collection.name,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item: collection.requests.map(toPostmanItem),
  };
  return JSON.stringify(postman, null, 2);
}

// ── OpenAPI 3.0 export ───────────────────────────────────────────────────────

function toOperationId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/[^a-z0-9]/g, '');
}

export function exportToOpenApi(collection: Collection): string {
  const paths: Record<string, any> = {};

  for (const req of collection.requests) {
    const pathname = extractPath(req.url);
    const method = req.method.toLowerCase();

    if (!paths[pathname]) paths[pathname] = {};

    const operation: any = {
      operationId: toOperationId(req.name),
      summary: req.name,
      parameters: [],
      responses: {
        '200': { description: 'Successful response' },
      },
    };

    // Headers as parameters
    for (const [name, schema] of Object.entries(req.headers ?? {})) {
      operation.parameters.push({ name, in: 'header', schema: { type: 'string' }, example: schema });
    }
    // Query params (req.params) as OpenAPI query parameters - dropping them
    // would export an endpoint that ignores its query string.
    for (const [name, value] of Object.entries(req.params ?? {})) {
      operation.parameters.push({ name, in: 'query', schema: { type: 'string' }, example: value });
    }
    if (operation.parameters.length === 0) delete operation.parameters;

    // Request body
    if (req.body) {
      const raw = typeof req.body === 'object' ? JSON.stringify(req.body) : req.body;
      let schema: any = { type: 'object' };
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const properties: Record<string, any> = {};
          for (const [k, v] of Object.entries(parsed)) {
            properties[k] = { type: typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'boolean' : 'string' };
          }
          schema = { type: 'object', properties };
        }
      } catch {
        schema = { type: 'string' };
      }
      operation.requestBody = {
        required: true,
        content: {
          'application/json': { schema },
        },
      };
    }

    paths[pathname][method] = operation;
  }

  const openapi = {
    openapi: '3.0.0',
    info: {
      title: collection.name,
      version: '1.0.0',
    },
    paths,
  };

  return JSON.stringify(openapi, null, 2);
}

// ── Markdown Docs export ─────────────────────────────────────────────────────

export function exportToDocs(collection: Collection): string {
  const lines: string[] = [];

  lines.push(`# ${collection.name}`);
  if (collection.description) {
    lines.push('');
    lines.push(collection.description);
  }

  for (const req of collection.requests) {
    lines.push('');
    lines.push(`## ${req.name}`);
    lines.push('');
    lines.push(`**${req.method.toUpperCase()}** \`${req.url}\``);
    lines.push('');

    // Headers
    if (req.headers && Object.keys(req.headers).length > 0) {
      lines.push('### Headers');
      lines.push('| Key | Value |');
      lines.push('|---|---|');
      for (const [k, v] of Object.entries(req.headers)) {
        lines.push(`| \`${k}\` | \`${v}\` |`);
      }
      lines.push('');
    }

    // Params
    if (req.params && Object.keys(req.params).length > 0) {
      lines.push('### Parameters');
      lines.push('| Key | Value |');
      lines.push('|---|---|');
      for (const [k, v] of Object.entries(req.params)) {
        lines.push(`| \`${k}\` | \`${v}\` |`);
      }
      lines.push('');
    }

    // Body
    if (req.body) {
      lines.push('### Request Body');
      if (typeof req.body === 'object' && req.body !== null) {
        if ('type' in req.body && req.body.type === 'multipart') {
          lines.push('**Type:** \`multipart/form-data\`');
          lines.push('');
          lines.push('| Name | Type | Value |');
          lines.push('|---|---|---|');
          for (const part of (req.body as import('../types/index.js').MultipartBody).parts) {
            lines.push(`| \`${part.name}\` | \`${part.type}\` | \`${part.value || part.filePath || ''}\` |`);
          }
          lines.push('');
        } else {
          lines.push('```json');
          lines.push(JSON.stringify(req.body, null, 2));
          lines.push('```');
          lines.push('');
        }
      } else {
        lines.push('```');
        lines.push(String(req.body));
        lines.push('```');
        lines.push('');
      }
    }

    // Examples
    if (req.examples && req.examples.length > 0) {
      lines.push('### Examples');
      for (const ex of req.examples) {
        lines.push('');
        lines.push(`#### ${ex.name}`);
        lines.push(`**Status:** ${ex.status}`);
        
        if (ex.body) {
          const isJson = ex.headers && Object.entries(ex.headers).some(([k, v]) => k.toLowerCase() === 'content-type' && v.includes('application/json'));
          const rawBody = typeof ex.body === 'object' ? JSON.stringify(ex.body, null, 2) : ex.body;
          lines.push('');
          lines.push(isJson || typeof ex.body === 'object' ? '```json' : '```');
          lines.push(rawBody);
          lines.push('```');
        }
      }
      lines.push('');
    }
  }

  return lines.join('\n').trim() + '\n';
}
