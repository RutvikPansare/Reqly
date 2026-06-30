import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handler } from './export-collection.js';
import type { EngineContext } from './types.js';

const mockCollection = {
  name: 'Test API',
  requests: [
    { id: '1', name: 'Get Items', method: 'GET', url: 'https://api.example.com/items' },
  ],
};

function makeContext(): EngineContext {
  return {
    collectionManager: {
      getCollection: vi.fn().mockResolvedValue(mockCollection),
    },
  } as unknown as EngineContext;
}

describe('export_collection tool', () => {
  it('exports as postman and returns content', async () => {
    const ctx = makeContext();
    const result = await handler({ collectionName: 'Test API', format: 'postman' }, ctx);
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text);
    expect(data.format).toBe('postman');
    const postman = JSON.parse(data.content);
    expect(postman.info.name).toBe('Test API');
    expect(postman.item).toHaveLength(1);
  });

  it('exports as openapi and returns content', async () => {
    const ctx = makeContext();
    const result = await handler({ collectionName: 'Test API', format: 'openapi' }, ctx);
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text);
    const openapi = JSON.parse(data.content);
    expect(openapi.openapi).toBe('3.0.0');
    expect(openapi.info.title).toBe('Test API');
  });

  it('exports as docs and returns markdown content', async () => {
    const ctx = makeContext();
    const result = await handler({ collectionName: 'Test API', format: 'docs' }, ctx);
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text);
    expect(data.format).toBe('docs');
    expect(data.content).toContain('# Test API');
    expect(data.content).toContain('## Get Items');
  });

  it('returns error for unknown format', async () => {
    const ctx = makeContext();
    const result = await handler({ collectionName: 'Test API', format: 'invalid' }, ctx);
    expect(result.isError).toBe(true);
  });

  it('returns error when collection not found', async () => {
    const ctx = makeContext();
    (ctx.collectionManager.getCollection as any).mockRejectedValue(new Error('Not found'));
    const result = await handler({ collectionName: 'Missing', format: 'postman' }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Not found');
  });
});
