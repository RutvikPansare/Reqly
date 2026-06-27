import { describe, it, expect, vi } from 'vitest';
import { definition as setDef, handler as setHandler } from './set-collection-spec.js';
import { definition as getDef, handler as getHandler } from './get-collection-spec.js';
import { definition as deleteDef, handler as deleteHandler } from './delete-collection-spec.js';
import { definition as listDef, handler as listHandler } from './list-spec-operations.js';
import { definition as validateDef, handler as validateHandler } from './validate-response.js';

const SPEC: any = {
  paths: {
    '/users/{id}': {
      get: {
        operationId: 'getUser',
        summary: 'Get a user',
        responses: { '200': { content: { 'application/json': { schema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } } } } },
      },
    },
  },
};

function makeContext(overrides: any = {}) {
  return {
    collectionManager: {
      setCollectionSpec: vi.fn().mockResolvedValue(undefined),
      getCollectionSpec: vi.fn().mockResolvedValue(undefined),
      deleteCollectionSpec: vi.fn().mockResolvedValue(undefined),
      getCollectionVariables: vi.fn().mockResolvedValue({}),
      getRequest: vi.fn(),
      ...(overrides.collectionManager || {}),
    },
    specLoader: {
      load: vi.fn().mockResolvedValue(SPEC),
      get: vi.fn().mockReturnValue(undefined),
      clear: vi.fn(),
      ...(overrides.specLoader || {}),
    },
    responseStore: { get: vi.fn().mockReturnValue(undefined), ...(overrides.responseStore || {}) },
  };
}

describe('set_collection_spec', () => {
  it('should have correct definition', () => {
    expect(setDef.name).toBe('set_collection_spec');
    expect(setDef.inputSchema.required).toEqual(['collection']);
  });

  it('persists the spec config, loads it, and returns operation count', async () => {
    const ctx = makeContext();
    const res = await setHandler({ collection: 'API', specPath: './openapi.json' }, ctx as any);
    expect(ctx.collectionManager.setCollectionSpec).toHaveBeenCalledWith('API', { specPath: './openapi.json' });
    expect(ctx.specLoader.load).toHaveBeenCalledWith('./openapi.json');
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toEqual({ collection: 'API', specPath: './openapi.json', operationCount: 1 });
    expect(res.isError).toBeFalsy();
  });
});

describe('get_collection_spec', () => {
  it('should have correct definition', () => {
    expect(getDef.name).toBe('get_collection_spec');
  });

  it('returns loaded:false when no spec is configured', async () => {
    const ctx = makeContext();
    const res = await getHandler({ collection: 'API' }, ctx as any);
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toEqual({ loaded: false, operationCount: 0 });
  });

  it('returns config + operation count when a spec is configured and cached', async () => {
    const ctx = makeContext({
      collectionManager: { getCollectionSpec: vi.fn().mockResolvedValue({ specPath: './openapi.json' }) },
      specLoader: { get: vi.fn().mockReturnValue(SPEC) },
    });
    const res = await getHandler({ collection: 'API' }, ctx as any);
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toEqual({ specPath: './openapi.json', specUrl: undefined, operationCount: 1, loaded: true });
  });
});

describe('delete_collection_spec', () => {
  it('should have correct definition', () => {
    expect(deleteDef.name).toBe('delete_collection_spec');
  });

  it('removes the spec config and clears the loader cache', async () => {
    const ctx = makeContext({
      collectionManager: { getCollectionSpec: vi.fn().mockResolvedValue({ specPath: './openapi.json' }) },
    });
    const res = await deleteHandler({ collection: 'API' }, ctx as any);
    expect(ctx.collectionManager.deleteCollectionSpec).toHaveBeenCalledWith('API');
    expect(ctx.specLoader.clear).toHaveBeenCalledWith('./openapi.json');
    expect(JSON.parse(res.content[0].text)).toEqual({ success: true, collection: 'API' });
  });
});

describe('list_spec_operations', () => {
  it('should have correct definition', () => {
    expect(listDef.name).toBe('list_spec_operations');
  });

  it('lists operations from the loaded spec', async () => {
    const ctx = makeContext({
      collectionManager: { getCollectionSpec: vi.fn().mockResolvedValue({ specPath: './openapi.json' }) },
    });
    const res = await listHandler({ collection: 'API' }, ctx as any);
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toEqual([{ operationId: 'getUser', method: 'GET', path: '/users/{id}', summary: 'Get a user' }]);
  });

  it('errors when no spec is configured', async () => {
    const ctx = makeContext();
    const res = await listHandler({ collection: 'API' }, ctx as any);
    expect(res.isError).toBe(true);
  });
});

describe('validate_response', () => {
  it('should have correct definition', () => {
    expect(validateDef.name).toBe('validate_response');
    expect(validateDef.inputSchema.required).toEqual(['collection', 'request']);
  });

  it('errors when no spec is configured', async () => {
    const ctx = makeContext();
    const res = await validateHandler({ collection: 'API', request: 'GetUser' }, ctx as any);
    expect(res.isError).toBe(true);
  });

  it('errors when there is no stored response for the request', async () => {
    const ctx = makeContext({
      collectionManager: { getCollectionSpec: vi.fn().mockResolvedValue({ specPath: './openapi.json' }) },
    });
    const res = await validateHandler({ collection: 'API', request: 'GetUser' }, ctx as any);
    expect(res.isError).toBe(true);
  });

  it('returns matched:false when the stored response has no corresponding operation', async () => {
    const ctx = makeContext({
      collectionManager: {
        getCollectionSpec: vi.fn().mockResolvedValue({ specPath: './openapi.json' }),
        getRequest: vi.fn().mockResolvedValue({ name: 'GetUser', method: 'GET', url: 'http://example.com/orders/1' }),
      },
      responseStore: { get: vi.fn().mockReturnValue({ status: 200, body: {}, headers: {}, latency: 1, timestamp: '' }) },
    });
    const res = await validateHandler({ collection: 'API', request: 'GetUser' }, ctx as any);
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toEqual({ violations: [], operation: undefined, matched: false });
  });

  it('validates the stored response against the matched operation', async () => {
    const ctx = makeContext({
      collectionManager: {
        getCollectionSpec: vi.fn().mockResolvedValue({ specPath: './openapi.json' }),
        getRequest: vi.fn().mockResolvedValue({ name: 'GetUser', method: 'GET', url: 'http://example.com/users/1' }),
      },
      responseStore: { get: vi.fn().mockReturnValue({ status: 200, body: { id: 'u1' }, headers: {}, latency: 1, timestamp: '' }) },
    });
    const res = await validateHandler({ collection: 'API', request: 'GetUser' }, ctx as any);
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toEqual({ violations: [], operation: 'getUser', matched: true });
  });
});
