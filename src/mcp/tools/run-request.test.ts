import { describe, it, expect, vi } from 'vitest';
import { definition, handler } from './run-request.js';

function makeContext(overrides: any = {}) {
  return {
    environmentManager: { getActiveEnvironment: async () => null },
    authManager: { getProfile: async () => null },
    executeRequest: async () => ({ status: 200 }),
    responseStore: { set: vi.fn(), get: () => undefined },
    historyStore: { append: vi.fn(), getLastTwo: () => [] },
    specLoader: { load: async () => ({}) },
    ...overrides,
    collectionManager: {
      getRequest: async () => ({ name: 'Req1', method: 'GET', url: 'http://foo' }),
      getCollectionVariables: async () => ({}),
      getCollectionAuth: async () => undefined,
      getCollectionSpec: async () => undefined,
      ...(overrides.collectionManager || {}),
    },
  };
}

describe('run-request', () => {
  it('should have correct definition', () => {
    expect(definition.name).toBe('run_request');
  });

  it('should run request and cache response', async () => {
    const mockContext = makeContext();
    const res = await handler({ collectionName: 'C', requestName: 'Req1' }, mockContext as any);
    expect(res.content[0].text).toContain('200');
    expect(mockContext.responseStore.set).toHaveBeenCalledWith('Req1', { status: 200 });
    expect(mockContext.historyStore.append).toHaveBeenCalled();
  });

  it('returns contractViolations: null when the collection has no spec configured', async () => {
    const mockContext = makeContext();
    const res = await handler({ collectionName: 'C', requestName: 'Req1' }, mockContext as any);
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.contractViolations).toBeNull();
  });

  it('returns contractViolations: [] when a spec is configured and the response is valid', async () => {
    const spec = {
      paths: { '/foo': { get: { operationId: 'getFoo', responses: { '200': { description: 'ok' } } } } },
    };
    const mockContext = makeContext({
      collectionManager: {
        getRequest: async () => ({ name: 'Req1', method: 'GET', url: 'http://example.com/foo' }),
        getCollectionSpec: async () => ({ specPath: './openapi.json' }),
      },
      specLoader: { load: async () => spec },
    });
    const res = await handler({ collectionName: 'C', requestName: 'Req1' }, mockContext as any);
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.contractViolations).toEqual([]);
  });

  it('returns empty violations (not matched) when the request path has no corresponding spec operation', async () => {
    const spec = {
      paths: { '/bar': { get: { operationId: 'getBar', responses: { '200': { description: 'ok' } } } } },
    };
    const mockContext = makeContext({
      collectionManager: {
        getRequest: async () => ({ name: 'Req1', method: 'GET', url: 'http://example.com/foo' }),
        getCollectionSpec: async () => ({ specPath: './openapi.json' }),
      },
      specLoader: { load: async () => spec },
    });
    const res = await handler({ collectionName: 'C', requestName: 'Req1' }, mockContext as any);
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.contractViolations).toEqual([]);
  });

  it('returns violations when a spec is configured and the response breaks the schema', async () => {
    const spec = {
      paths: {
        '/foo': {
          get: {
            operationId: 'getFoo',
            responses: { '404': { description: 'not found' } },
          },
        },
      },
    };
    const mockContext = makeContext({
      collectionManager: {
        getRequest: async () => ({ name: 'Req1', method: 'GET', url: 'http://example.com/foo' }),
        getCollectionSpec: async () => ({ specPath: './openapi.json' }),
      },
      specLoader: { load: async () => spec },
    });
    const res = await handler({ collectionName: 'C', requestName: 'Req1' }, mockContext as any);
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.contractViolations.length).toBeGreaterThan(0);
  });
});
