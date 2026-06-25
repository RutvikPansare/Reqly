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
});
