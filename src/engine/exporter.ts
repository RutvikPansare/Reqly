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

function toPostmanItem(req: CollectionRequest) {
  const item: any = {
    name: req.name,
    request: {
      method: req.method,
      header: toPostmanHeaders(req.headers),
      url: {
        raw: req.url,
        host: [extractHost(req.url)],
        path: extractPath(req.url).split('/').filter(Boolean),
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
