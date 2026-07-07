import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { parsePostman, parseBruno, importFromFile, importFromContent } from './importer.js';
import { CollectionManager } from './collection-manager.js';

// ── parsePostman ────────────────────────────────────────────────────────────

describe('parsePostman', () => {
  it('extracts the collection name from info.name', () => {
    const data = { info: { _postman_id: 'abc', name: 'My API' }, item: [] };
    const { collectionName } = parsePostman(JSON.stringify(data));
    expect(collectionName).toBe('My API');
  });

  it('falls back to "Imported" when info.name is missing', () => {
    const data = { info: {}, item: [] };
    const { collectionName } = parsePostman(JSON.stringify(data));
    expect(collectionName).toBe('Imported');
  });

  it('maps a simple GET request with a string url', () => {
    const data = {
      info: { name: 'Test' },
      item: [{
        name: 'Get Users',
        request: { method: 'GET', url: 'https://api.example.com/users', header: [] }
      }]
    };
    const { requests } = parsePostman(JSON.stringify(data));
    expect(requests).toHaveLength(1);
    expect(requests[0].name).toBe('Get Users');
    expect(requests[0].method).toBe('GET');
    expect(requests[0].url).toBe('https://api.example.com/users');
  });

  it('maps a POST request with headers and raw body', () => {
    const data = {
      info: { name: 'Test' },
      item: [{
        name: 'Create User',
        request: {
          method: 'POST',
          url: { raw: 'https://api.example.com/users' },
          header: [{ key: 'Content-Type', value: 'application/json', disabled: false }],
          body: { mode: 'raw', raw: '{"name":"John"}' }
        }
      }]
    };
    const { requests } = parsePostman(JSON.stringify(data));
    expect(requests[0].method).toBe('POST');
    expect(requests[0].headers?.['Content-Type']).toBe('application/json');
    expect(requests[0].body).toBe('{"name":"John"}');
  });

  it('maps query params from url.query', () => {
    const data = {
      info: { name: 'Test' },
      item: [{
        name: 'Search',
        request: {
          method: 'GET',
          url: {
            raw: 'https://api.example.com/search?q=test',
            query: [{ key: 'q', value: 'test', disabled: false }]
          },
          header: []
        }
      }]
    };
    const { requests } = parsePostman(JSON.stringify(data));
    expect(requests[0].params?.['q']).toBe('test');
  });

  it('skips disabled headers and query params', () => {
    const data = {
      info: { name: 'Test' },
      item: [{
        name: 'Req',
        request: {
          method: 'GET',
          url: { raw: 'https://example.com', query: [{ key: 'skip', value: 'yes', disabled: true }] },
          header: [{ key: 'X-Skip', value: 'yes', disabled: true }]
        }
      }]
    };
    const { requests } = parsePostman(JSON.stringify(data));
    expect(requests[0].params).toBeUndefined();
    expect(requests[0].headers).toBeUndefined();
  });

  it('flattens nested folder items', () => {
    const data = {
      info: { name: 'Test' },
      item: [{
        name: 'Folder',
        item: [{
          name: 'Nested Request',
          request: { method: 'GET', url: 'https://example.com', header: [] }
        }]
      }]
    };
    const { requests } = parsePostman(JSON.stringify(data));
    expect(requests).toHaveLength(1);
    expect(requests[0].name).toBe('Nested Request');
  });

  it('assigns a non-empty id to each request', () => {
    const data = {
      info: { name: 'Test' },
      item: [{ name: 'R', request: { method: 'GET', url: 'https://x.com', header: [] } }]
    };
    const { requests } = parsePostman(JSON.stringify(data));
    expect(requests[0].id).toBeTruthy();
  });
});

// ── parseBruno ──────────────────────────────────────────────────────────────

describe('parseBruno', () => {
  it('parses a simple GET request', () => {
    const bru = `
meta {
  name: Get All Users
  type: http
}

get {
  url: https://jsonplaceholder.typicode.com/users
  body: none
}
`;
    const { requestName, request } = parseBruno(bru);
    expect(requestName).toBe('Get All Users');
    expect(request.method).toBe('GET');
    expect(request.url).toBe('https://jsonplaceholder.typicode.com/users');
  });

  it('parses a POST with headers', () => {
    const bru = `
meta {
  name: Login
}

post {
  url: https://api.example.com/login
}

headers {
  content-type: application/json
  x-api-key: secret
}
`;
    const { request } = parseBruno(bru);
    expect(request.method).toBe('POST');
    expect(request.headers?.['content-type']).toBe('application/json');
    expect(request.headers?.['x-api-key']).toBe('secret');
  });

  it('parses a json body block', () => {
    const bru = `
meta {
  name: Create User
}

post {
  url: https://api.example.com/users
}

body:json {
  {"name":"John","email":"john@example.com"}
}
`;
    const { request } = parseBruno(bru);
    expect(request.body).toContain('"name"');
    expect(request.body).toContain('"John"');
  });

  it('parses a multi-line json body block', () => {
    const bru = `
meta {
  name: Create
}

post {
  url: https://api.example.com
}

body:json {
  {
    "nested": {"key": "value"}
  }
}
`;
    const { request } = parseBruno(bru);
    expect(request.body).toContain('"nested"');
    expect(request.body).toContain('"key"');
  });

  it('parses query params', () => {
    const bru = `
meta {
  name: Search
}

get {
  url: https://api.example.com/search
}

query {
  q: hello world
  limit: 10
}
`;
    const { request } = parseBruno(bru);
    expect(request.params?.['q']).toBe('hello world');
    expect(request.params?.['limit']).toBe('10');
  });

  it('uses defaultName when meta block is absent', () => {
    const bru = `
get {
  url: https://example.com
}
`;
    const { requestName } = parseBruno(bru, 'my-fallback');
    expect(requestName).toBe('my-fallback');
  });

  it('preserves url with colons (https://...)', () => {
    const bru = `
meta { name: R }
get { url: https://api.example.com/v2/users }
`;
    const { request } = parseBruno(bru);
    expect(request.url).toBe('https://api.example.com/v2/users');
  });
});

// ── importFromFile ──────────────────────────────────────────────────────────

describe('importFromFile', () => {
  let tmpDir: string;
  let manager: CollectionManager;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reqly-import-'));
    manager = new CollectionManager(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('imports a Postman JSON file', async () => {
    const postman = {
      info: { _postman_id: 'x', name: 'Pet API' },
      item: [
        { name: 'List Pets', request: { method: 'GET', url: 'https://api.example.com/pets', header: [] } },
        { name: 'Create Pet', request: { method: 'POST', url: 'https://api.example.com/pets', header: [], body: { mode: 'raw', raw: '{}' } } }
      ]
    };
    const filePath = path.join(tmpDir, 'pets.json');
    await fs.writeFile(filePath, JSON.stringify(postman));

    const result = await importFromFile(filePath, 'postman', manager);
    expect(result.collectionName).toBe('Pet API');
    expect(result.requestsImported).toBe(2);

    const col = await manager.getCollection('Pet API');
    expect(col.requests.map(r => r.name)).toContain('List Pets');
    expect(col.requests.map(r => r.name)).toContain('Create Pet');
  });

  it('imports a Postman file with nested folders', async () => {
    const postman = {
      info: { name: 'Nested' },
      item: [{
        name: 'Auth',
        item: [{ name: 'Login', request: { method: 'POST', url: 'https://example.com/login', header: [] } }]
      }]
    };
    const filePath = path.join(tmpDir, 'nested.json');
    await fs.writeFile(filePath, JSON.stringify(postman));

    const result = await importFromFile(filePath, 'postman', manager);
    expect(result.requestsImported).toBe(1);
    const col = await manager.getCollection('Nested');
    expect(col.requests[0].name).toBe('Login');
  });

  it('imports a single Bruno .bru file', async () => {
    const bruDir = path.join(tmpDir, 'myapi');
    await fs.mkdir(bruDir);
    const bru = `
meta {
  name: Get Posts
}
get {
  url: https://jsonplaceholder.typicode.com/posts
}
`;
    const filePath = path.join(bruDir, 'get-posts.bru');
    await fs.writeFile(filePath, bru);

    const result = await importFromFile(filePath, 'bruno', manager);
    expect(result.requestsImported).toBe(1);
    expect(result.collectionName).toBe('myapi');
    const col = await manager.getCollection('myapi');
    expect(col.requests[0].name).toBe('Get Posts');
  });

  it('imports a directory of Bruno .bru files', async () => {
    const bruDir = path.join(tmpDir, 'todos-api');
    await fs.mkdir(bruDir);

    const bru1 = `meta { name: List Todos }\nget { url: https://api.example.com/todos }`;
    const bru2 = `meta { name: Create Todo }\npost { url: https://api.example.com/todos }`;
    await fs.writeFile(path.join(bruDir, 'list.bru'), bru1);
    await fs.writeFile(path.join(bruDir, 'create.bru'), bru2);

    const result = await importFromFile(bruDir, 'bruno', manager);
    expect(result.requestsImported).toBe(2);
    expect(result.collectionName).toBe('todos-api');
    const col = await manager.getCollection('todos-api');
    expect(col.requests).toHaveLength(2);
  });

  it('throws when the source file does not exist', async () => {
    await expect(
      importFromFile('/nonexistent/file.json', 'postman', manager)
    ).rejects.toThrow('File not found');
  });

  // Regression: two requests with the same name used to silently overwrite each
  // other (addRequest is an upsert), losing data and over-reporting the count.
  it('keeps all requests when two share the same name (suffixes the collision)', async () => {
    const postman = {
      info: { name: 'Dupes' },
      item: [
        { name: 'Login', request: { method: 'POST', url: 'https://x.com/a', header: [] } },
        { name: 'Login', request: { method: 'GET', url: 'https://x.com/b', header: [] } },
      ],
    };
    const filePath = path.join(tmpDir, 'dupes.json');
    await fs.writeFile(filePath, JSON.stringify(postman));

    const result = await importFromFile(filePath, 'postman', manager);
    expect(result.requestsImported).toBe(2);
    const col = await manager.getCollection('Dupes');
    expect(col.requests).toHaveLength(2);
    // Both original URLs survive - neither was clobbered.
    expect(col.requests.map(r => r.url).sort()).toEqual(['https://x.com/a', 'https://x.com/b']);
  });

  // Regression: a request whose name sanitizes to an empty string used to be
  // written as ".yaml"; with the path-safety guard it would throw and abort the
  // whole import. The importer must guarantee a usable name.
  it('imports a request whose name is empty after sanitization', async () => {
    const postman = {
      info: { name: 'EmptyName' },
      item: [
        { name: '   ', request: { method: 'GET', url: 'https://x.com/ok', header: [] } },
      ],
    };
    const filePath = path.join(tmpDir, 'emptyname.json');
    await fs.writeFile(filePath, JSON.stringify(postman));

    const result = await importFromFile(filePath, 'postman', manager);
    expect(result.requestsImported).toBe(1);
    const col = await manager.getCollection('EmptyName');
    expect(col.requests).toHaveLength(1);
    expect(col.requests[0].name.length).toBeGreaterThan(0);
    expect(col.requests[0].url).toBe('https://x.com/ok');
  });
});

// ── importFromContent ───────────────────────────────────────────────────────

describe('importFromContent', () => {
  let tmpDir: string;
  let manager: CollectionManager;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reqly-import-content-'));
    manager = new CollectionManager(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('imports Postman content string', async () => {
    const postman = {
      info: { name: 'UI Import' },
      item: [{ name: 'Ping', request: { method: 'GET', url: 'https://example.com/ping', header: [] } }]
    };
    const result = await importFromContent(JSON.stringify(postman), 'postman', manager);
    expect(result.collectionName).toBe('UI Import');
    expect(result.requestsImported).toBe(1);
  });

  it('imports Postman content with caller-supplied collection name', async () => {
    const postman = {
      info: { name: 'Original Name' },
      item: [{ name: 'Req', request: { method: 'GET', url: 'https://x.com', header: [] } }]
    };
    const result = await importFromContent(JSON.stringify(postman), 'postman', manager, 'Override Name');
    expect(result.collectionName).toBe('Override Name');
  });

  it('imports a Bruno content string', async () => {
    const bru = `
meta { name: My Request }
get { url: https://api.example.com }
`;
    const result = await importFromContent(bru, 'bruno', manager, 'BrunoCol');
    expect(result.requestsImported).toBe(1);
    expect(result.collectionName).toBe('BrunoCol');
  });
});

// ── parseInsomnia ────────────────────────────────────────────────────────────

import { parseInsomnia, parseOpenApi } from './importer.js';

describe('parseInsomnia', () => {
  it('extracts the collection name from workspace name', () => {
    const data = {
      _type: 'export',
      __export_format: 4,
      resources: [
        { _type: 'workspace', _id: 'wrk_1', name: 'My Insomnia API' },
      ],
    };
    const { collectionName } = parseInsomnia(JSON.stringify(data));
    expect(collectionName).toBe('My Insomnia API');
  });

  it('maps a simple GET request', () => {
    const data = {
      _type: 'export',
      __export_format: 4,
      resources: [
        { _type: 'workspace', _id: 'wrk_1', name: 'Test' },
        { _type: 'request', _id: 'req_1', parentId: 'wrk_1', name: 'Get Users', method: 'GET', url: 'https://api.example.com/users', headers: [], body: {} },
      ],
    };
    const { requests } = parseInsomnia(JSON.stringify(data));
    expect(requests).toHaveLength(1);
    expect(requests[0].name).toBe('Get Users');
    expect(requests[0].method).toBe('GET');
    expect(requests[0].url).toBe('https://api.example.com/users');
  });

  it('maps headers and JSON body', () => {
    const data = {
      _type: 'export',
      __export_format: 4,
      resources: [
        { _type: 'workspace', _id: 'wrk_1', name: 'Test' },
        {
          _type: 'request', _id: 'req_2', parentId: 'wrk_1',
          name: 'Create User', method: 'POST',
          url: 'https://api.example.com/users',
          headers: [{ name: 'Content-Type', value: 'application/json' }],
          body: { mimeType: 'application/json', text: '{"name":"Alice"}' },
        },
      ],
    };
    const { requests } = parseInsomnia(JSON.stringify(data));
    expect(requests[0].headers?.['Content-Type']).toBe('application/json');
    expect(requests[0].body).toBe('{"name":"Alice"}');
  });

  it('flattens requests from folder groups', () => {
    const data = {
      _type: 'export',
      __export_format: 4,
      resources: [
        { _type: 'workspace', _id: 'wrk_1', name: 'Test' },
        { _type: 'request_group', _id: 'grp_1', parentId: 'wrk_1', name: 'Users' },
        { _type: 'request', _id: 'req_1', parentId: 'grp_1', name: 'List', method: 'GET', url: 'https://api.example.com/users', headers: [], body: {} },
      ],
    };
    const { requests } = parseInsomnia(JSON.stringify(data));
    expect(requests).toHaveLength(1);
    expect(requests[0].name).toBe('List');
  });

  it('falls back to "Imported" when no workspace found', () => {
    const data = { _type: 'export', __export_format: 4, resources: [] };
    const { collectionName } = parseInsomnia(JSON.stringify(data));
    expect(collectionName).toBe('Imported');
  });
});

// ── parseOpenApi ─────────────────────────────────────────────────────────────

describe('parseOpenApi - OAS 3.0 JSON', () => {
  it('extracts collection name from info.title', () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 'Pet Store API', version: '1.0.0' },
      paths: {},
    };
    const { collectionName } = parseOpenApi(JSON.stringify(spec));
    expect(collectionName).toBe('Pet Store API');
  });

  it('maps a simple GET path', () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 'API', version: '1' },
      paths: {
        '/pets': {
          get: { operationId: 'listPets', summary: 'List pets', parameters: [] },
        },
      },
    };
    const { requests } = parseOpenApi(JSON.stringify(spec));
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe('GET');
    expect(requests[0].url).toBe('/pets');
    expect(requests[0].name).toBe('listPets');
  });

  it('uses summary when operationId is absent', () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 'API', version: '1' },
      paths: {
        '/pets': {
          post: { summary: 'Create a pet' },
        },
      },
    };
    const { requests } = parseOpenApi(JSON.stringify(spec));
    expect(requests[0].name).toBe('Create a pet');
    expect(requests[0].method).toBe('POST');
  });

  it('prepends servers[0].url as base URL', () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 'API', version: '1' },
      servers: [{ url: 'https://api.example.com/v2' }],
      paths: { '/users': { get: { operationId: 'listUsers' } } },
    };
    const { requests } = parseOpenApi(JSON.stringify(spec));
    expect(requests[0].url).toBe('https://api.example.com/v2/users');
  });

  it('maps multiple methods on the same path', () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 'API', version: '1' },
      paths: {
        '/items': {
          get: { operationId: 'listItems' },
          post: { operationId: 'createItem' },
        },
      },
    };
    const { requests } = parseOpenApi(JSON.stringify(spec));
    expect(requests).toHaveLength(2);
  });
});

describe('parseOpenApi - Swagger 2.0 JSON', () => {
  it('extracts collection name from info.title', () => {
    const spec = {
      swagger: '2.0',
      info: { title: 'Swagger API', version: '1' },
      paths: {},
    };
    const { collectionName } = parseOpenApi(JSON.stringify(spec));
    expect(collectionName).toBe('Swagger API');
  });

  it('builds URL from host + basePath + path', () => {
    const spec = {
      swagger: '2.0',
      info: { title: 'API', version: '1' },
      host: 'api.example.com',
      basePath: '/v1',
      paths: {
        '/users': { get: { operationId: 'listUsers' } },
      },
    };
    const { requests } = parseOpenApi(JSON.stringify(spec));
    expect(requests[0].url).toBe('https://api.example.com/v1/users');
  });
});

describe('importFromContent - insomnia + openapi', () => {
  let tmpDir: string;
  let manager: CollectionManager;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reqly-test-'));
    manager = new CollectionManager(tmpDir);
  });
  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('imports Insomnia content', async () => {
    const data = {
      _type: 'export', __export_format: 4,
      resources: [
        { _type: 'workspace', _id: 'wrk_1', name: 'InsomniaCol' },
        { _type: 'request', _id: 'req_1', parentId: 'wrk_1', name: 'Get All', method: 'GET', url: 'https://example.com', headers: [], body: {} },
      ],
    };
    const result = await importFromContent(JSON.stringify(data), 'insomnia', manager);
    expect(result.collectionName).toBe('InsomniaCol');
    expect(result.requestsImported).toBe(1);
  });

  it('imports OpenAPI content', async () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 'OpenAPICol', version: '1' },
      paths: {
        '/items': { get: { operationId: 'listItems' } },
        '/items/{id}': { delete: { operationId: 'deleteItem' } },
      },
    };
    const result = await importFromContent(JSON.stringify(spec), 'openapi', manager);
    expect(result.collectionName).toBe('OpenAPICol');
    expect(result.requestsImported).toBe(2);
  });
});
