import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CollectionManager, CollectionNotFoundError, RequestNotFoundError } from './collection-manager.js';
import { CollectionRequest } from '../types/index.js';

describe('CollectionManager', () => {
  let tmpDir: string;
  let manager: CollectionManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reqly-test-'));
    manager = new CollectionManager(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('exposes the base directory it was constructed with', () => {
    expect(manager.getBaseDir()).toBe(tmpDir);
  });

  it('should create and get a collection', async () => {
    const col = await manager.createCollection('TestCol');
    expect(col.name).toBe('TestCol');
    expect(col.requests).toEqual([]);

    const retrieved = await manager.getCollection('TestCol');
    expect(retrieved.name).toBe('TestCol');
  });

  it('should list collections', async () => {
    await manager.createCollection('Col1');
    await manager.createCollection('Col2');

    const cols = await manager.listCollections();
    expect(cols).toHaveLength(2);
    expect(cols.map(c => c.name).sort()).toEqual(['Col1', 'Col2']);
  });

  it('does not list the reserved flows/ directory as a collection', async () => {
    await manager.createCollection('Col1');
    fs.mkdirSync(path.join(tmpDir, 'flows'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'flows', 'MyFlow.yaml'), 'name: MyFlow\nsteps: []\n');

    const cols = await manager.listCollections();
    expect(cols.map(c => c.name)).toEqual(['Col1']);
  });

  it('should throw CollectionNotFoundError if getting missing collection', async () => {
    await expect(manager.getCollection('Missing')).rejects.toThrow(CollectionNotFoundError);
  });

  it('should add, get, and delete requests', async () => {
    await manager.createCollection('TestCol');

    const req: CollectionRequest = {
      id: 'req-1',
      name: 'GetUser',
      method: 'GET',
      url: 'http://example.com/user/1',
    };

    await manager.addRequest('TestCol', req);

    const retrievedReq = await manager.getRequest('TestCol', 'GetUser');
    expect(retrievedReq.url).toBe('http://example.com/user/1');

    const col = await manager.getCollection('TestCol');
    expect(col.requests).toHaveLength(1);
    expect(col.requests[0].name).toBe('GetUser');

    await manager.deleteRequest('TestCol', 'GetUser');
    
    await expect(manager.getRequest('TestCol', 'GetUser')).rejects.toThrow(RequestNotFoundError);
    const colAfterDelete = await manager.getCollection('TestCol');
    expect(colAfterDelete.requests).toHaveLength(0);
  });

  it('should update an existing request when adding with same name', async () => {
    await manager.createCollection('TestCol');

    const req: CollectionRequest = {
      id: 'req-1',
      name: 'UpdateMe',
      method: 'GET',
      url: 'http://old.com',
    };
    await manager.addRequest('TestCol', req);

    req.url = 'http://new.com';
    await manager.addRequest('TestCol', req);

    const retrievedReq = await manager.getRequest('TestCol', 'UpdateMe');
    expect(retrievedReq.url).toBe('http://new.com');
  });

  it('should delete a collection and its requests', async () => {
    await manager.createCollection('TestCol');
    await manager.addRequest('TestCol', { id: 'r1', name: 'GetUser', method: 'GET', url: 'http://x.com' });
    await manager.createCollection('Other');

    await manager.deleteCollection('TestCol');

    const cols = await manager.listCollections();
    expect(cols.map(c => c.name)).toEqual(['Other']);
    await expect(manager.getCollection('TestCol')).rejects.toThrow(CollectionNotFoundError);
  });

  it('should throw when deleting a missing collection', async () => {
    await expect(manager.deleteCollection('Missing')).rejects.toThrow(CollectionNotFoundError);
  });

  it('should rename a collection, preserving its requests', async () => {
    await manager.createCollection('OldName');
    await manager.addRequest('OldName', { id: 'r1', name: 'GetUser', method: 'GET', url: 'http://x.com' });

    await manager.renameCollection('OldName', 'NewName');

    const renamed = await manager.getCollection('NewName');
    expect(renamed.name).toBe('NewName');
    expect(renamed.requests).toHaveLength(1);
    expect(renamed.requests[0].name).toBe('GetUser');
    await expect(manager.getCollection('OldName')).rejects.toThrow(CollectionNotFoundError);
  });

  it('should throw when renaming a missing collection', async () => {
    await expect(manager.renameCollection('Missing', 'NewName')).rejects.toThrow(CollectionNotFoundError);
  });

  it('should duplicate a request under a new name', async () => {
    await manager.createCollection('TestCol');
    await manager.addRequest('TestCol', { id: 'r1', name: 'GetUser', method: 'GET', url: 'http://x.com' });

    await manager.duplicateRequest('TestCol', 'GetUser', 'GetUser Copy');

    const col = await manager.getCollection('TestCol');
    expect(col.requests.map(r => r.name).sort()).toEqual(['GetUser', 'GetUser Copy']);
    const copy = await manager.getRequest('TestCol', 'GetUser Copy');
    expect(copy.url).toBe('http://x.com');
    expect(copy.method).toBe('GET');
  });

  it('should round-trip a graphql type request through YAML', async () => {
    await manager.createCollection('GQL');
    const gqlReq: CollectionRequest = {
      id: 'gql-1',
      name: 'ListUsers',
      method: 'POST',
      url: 'https://api.example.com/graphql',
      type: 'graphql',
      graphql: {
        query: 'query ListUsers { users { id name } }',
        variables: { limit: 10 },
      },
    };
    await manager.addRequest('GQL', gqlReq);

    const retrieved = await manager.getRequest('GQL', 'ListUsers');
    expect(retrieved.type).toBe('graphql');
    expect(retrieved.graphql?.query).toBe('query ListUsers { users { id name } }');
    expect(retrieved.graphql?.variables).toEqual({ limit: 10 });
  });

  it('should round-trip a graphql request without variables through YAML', async () => {
    await manager.createCollection('GQL2');
    const gqlReq: CollectionRequest = {
      id: 'gql-2',
      name: 'HealthCheck',
      method: 'POST',
      url: 'https://api.example.com/graphql',
      type: 'graphql',
      graphql: { query: 'query { health }' },
    };
    await manager.addRequest('GQL2', gqlReq);

    const retrieved = await manager.getRequest('GQL2', 'HealthCheck');
    expect(retrieved.type).toBe('graphql');
    expect(retrieved.graphql?.query).toBe('query { health }');
    expect(retrieved.graphql?.variables).toBeUndefined();
  });

  describe('saveExample / listExamples', () => {
    const makeExample = (overrides: Partial<any> = {}) => ({
      name: 'Success 200',
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: { id: 1, email: 'test@example.com' },
      latency: 142,
      ...overrides,
    });

    it('should save an example and retrieve it via listExamples', async () => {
      await manager.createCollection('API');
      await manager.addRequest('API', { id: 'r1', name: 'GetUser', method: 'GET', url: 'https://api.example.com/user' });

      const saved = await manager.saveExample('API', 'GetUser', makeExample());
      expect(saved.id).toBeDefined();
      expect(saved.name).toBe('Success 200');
      expect(saved.savedAt).toBeDefined();

      const examples = await manager.listExamples('API', 'GetUser');
      expect(examples).toHaveLength(1);
      expect(examples[0].status).toBe(200);
    });

    it('should append multiple examples without overwriting', async () => {
      await manager.createCollection('API');
      await manager.addRequest('API', { id: 'r2', name: 'GetItems', method: 'GET', url: 'https://api.example.com/items' });

      await manager.saveExample('API', 'GetItems', makeExample({ name: 'Empty list', status: 200, body: [] }));
      await manager.saveExample('API', 'GetItems', makeExample({ name: 'Not found', status: 404, body: { error: 'not found' } }));

      const examples = await manager.listExamples('API', 'GetItems');
      expect(examples).toHaveLength(2);
      expect(examples.map((e: any) => e.name)).toEqual(['Empty list', 'Not found']);
    });

    it('should persist examples in YAML alongside the request', async () => {
      await manager.createCollection('API');
      await manager.addRequest('API', { id: 'r3', name: 'CreateUser', method: 'POST', url: 'https://api.example.com/users' });
      await manager.saveExample('API', 'CreateUser', makeExample({ status: 201, name: 'Created' }));

      // Re-read via getRequest to confirm YAML persistence
      const req = await manager.getRequest('API', 'CreateUser');
      expect(req.examples).toHaveLength(1);
      expect(req.examples![0].status).toBe(201);
    });

    it('should return empty array when no examples exist', async () => {
      await manager.createCollection('API');
      await manager.addRequest('API', { id: 'r4', name: 'Ping', method: 'GET', url: '/ping' });

      const examples = await manager.listExamples('API', 'Ping');
      expect(examples).toEqual([]);
    });

    it('should throw when saving to a missing request', async () => {
      await manager.createCollection('API');
      await expect(manager.saveExample('API', 'NonExistent', makeExample())).rejects.toThrow(RequestNotFoundError);
    });

    it('should throw when listing examples for a missing request', async () => {
      await manager.createCollection('API');
      await expect(manager.listExamples('API', 'NonExistent')).rejects.toThrow(RequestNotFoundError);
    });
  });

  describe('collection variables', () => {
    it('returns an empty object when no variables are set', async () => {
      await manager.createCollection('API');
      const vars = await manager.getCollectionVariables('API');
      expect(vars).toEqual({});
    });

    it('sets and reads back a collection variable', async () => {
      await manager.createCollection('API');
      await manager.setCollectionVariable('API', 'baseUrl', 'https://api.example.com');
      const vars = await manager.getCollectionVariables('API');
      expect(vars).toEqual({ baseUrl: 'https://api.example.com' });
    });

    it('updates an existing variable and keeps the others', async () => {
      await manager.createCollection('API');
      await manager.setCollectionVariable('API', 'a', '1');
      await manager.setCollectionVariable('API', 'b', '2');
      await manager.setCollectionVariable('API', 'a', '99');
      const vars = await manager.getCollectionVariables('API');
      expect(vars).toEqual({ a: '99', b: '2' });
    });

    it('deletes a collection variable', async () => {
      await manager.createCollection('API');
      await manager.setCollectionVariable('API', 'a', '1');
      await manager.setCollectionVariable('API', 'b', '2');
      await manager.deleteCollectionVariable('API', 'a');
      const vars = await manager.getCollectionVariables('API');
      expect(vars).toEqual({ b: '2' });
    });

    it('persists variables in a collection.yaml metadata file', async () => {
      await manager.createCollection('API');
      await manager.setCollectionVariable('API', 'baseUrl', 'https://x');
      const metaPath = path.join(tmpDir, 'API', 'collection.yaml');
      expect(fs.existsSync(metaPath)).toBe(true);
    });

    it('does not treat collection.yaml as a request', async () => {
      await manager.createCollection('API');
      await manager.setCollectionVariable('API', 'baseUrl', 'https://x');
      await manager.addRequest('API', { id: 'r1', name: 'Ping', method: 'GET', url: '/ping' });
      const col = await manager.getCollection('API');
      expect(col.requests).toHaveLength(1);
      expect(col.requests[0].name).toBe('Ping');
    });

    it('surfaces variables on the returned collection', async () => {
      await manager.createCollection('API');
      await manager.setCollectionVariable('API', 'baseUrl', 'https://x');
      const col = await manager.getCollection('API');
      expect(col.variables).toEqual({ baseUrl: 'https://x' });
    });

    it('throws when setting a variable on a missing collection', async () => {
      await expect(manager.setCollectionVariable('Nope', 'a', '1')).rejects.toThrow(CollectionNotFoundError);
    });
  });

  describe('collection auth', () => {
    it('returns undefined when no auth is set', async () => {
      await manager.createCollection('API');
      expect(await manager.getCollectionAuth('API')).toBeUndefined();
    });

    it('sets and reads back collection auth', async () => {
      await manager.createCollection('API');
      await manager.setCollectionAuth('API', { type: 'bearer', credentials: { token: 't' } });
      expect(await manager.getCollectionAuth('API')).toEqual({ type: 'bearer', credentials: { token: 't' } });
    });

    it('deletes collection auth', async () => {
      await manager.createCollection('API');
      await manager.setCollectionAuth('API', { type: 'bearer', credentials: { token: 't' } });
      await manager.deleteCollectionAuth('API');
      expect(await manager.getCollectionAuth('API')).toBeUndefined();
    });

    it('keeps variables intact when setting auth', async () => {
      await manager.createCollection('API');
      await manager.setCollectionVariable('API', 'baseUrl', 'https://x');
      await manager.setCollectionAuth('API', { type: 'bearer', credentials: { token: 't' } });
      expect(await manager.getCollectionVariables('API')).toEqual({ baseUrl: 'https://x' });
      expect(await manager.getCollectionAuth('API')).toEqual({ type: 'bearer', credentials: { token: 't' } });
    });

    it('surfaces auth on the returned collection', async () => {
      await manager.createCollection('API');
      await manager.setCollectionAuth('API', { type: 'bearer', credentials: { token: 't' } });
      const col = await manager.getCollection('API');
      expect(col.auth).toEqual({ type: 'bearer', credentials: { token: 't' } });
    });

    it('throws when setting auth on a missing collection', async () => {
      await expect(manager.setCollectionAuth('Nope', { type: 'bearer' })).rejects.toThrow(CollectionNotFoundError);
    });
  });

  describe('collection spec', () => {
    it('returns undefined when no spec is set', async () => {
      await manager.createCollection('API');
      expect(await manager.getCollectionSpec('API')).toBeUndefined();
    });

    it('sets and reads back a collection spec', async () => {
      await manager.createCollection('API');
      await manager.setCollectionSpec('API', { specPath: './openapi.yaml' });
      expect(await manager.getCollectionSpec('API')).toEqual({ specPath: './openapi.yaml' });
    });

    it('deletes a collection spec', async () => {
      await manager.createCollection('API');
      await manager.setCollectionSpec('API', { specUrl: 'https://x/openapi.json' });
      await manager.deleteCollectionSpec('API');
      expect(await manager.getCollectionSpec('API')).toBeUndefined();
    });

    it('keeps auth and variables intact when setting a spec', async () => {
      await manager.createCollection('API');
      await manager.setCollectionVariable('API', 'baseUrl', 'https://x');
      await manager.setCollectionAuth('API', { type: 'bearer', credentials: { token: 't' } });
      await manager.setCollectionSpec('API', { specPath: './openapi.yaml' });
      expect(await manager.getCollectionVariables('API')).toEqual({ baseUrl: 'https://x' });
      expect(await manager.getCollectionAuth('API')).toEqual({ type: 'bearer', credentials: { token: 't' } });
      expect(await manager.getCollectionSpec('API')).toEqual({ specPath: './openapi.yaml' });
    });

    it('surfaces the spec on the returned collection', async () => {
      await manager.createCollection('API');
      await manager.setCollectionSpec('API', { specPath: './openapi.yaml' });
      const col = await manager.getCollection('API');
      expect(col.spec).toEqual({ specPath: './openapi.yaml' });
    });

    it('throws when setting a spec on a missing collection', async () => {
      await expect(manager.setCollectionSpec('Nope', { specPath: './x.yaml' })).rejects.toThrow(CollectionNotFoundError);
    });
  });
});
