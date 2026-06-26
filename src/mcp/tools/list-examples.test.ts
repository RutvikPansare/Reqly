import { describe, it, expect, vi } from 'vitest';
import { handler } from './list-examples.js';
import type { EngineContext } from './types.js';

const examples = [
  { id: 'ex-1', name: '200 OK', status: 200, headers: {}, body: { ok: true }, latency: 50, savedAt: '2026-06-25T00:00:00.000Z' },
  { id: 'ex-2', name: '404 Not Found', status: 404, headers: {}, body: { error: 'not found' }, latency: 30, savedAt: '2026-06-25T01:00:00.000Z' },
];

function makeContext(): EngineContext {
  return {
    collectionManager: {
      listExamples: vi.fn().mockResolvedValue(examples),
    },
  } as unknown as EngineContext;
}

describe('list_examples tool', () => {
  it('returns examples with count', async () => {
    const ctx = makeContext();
    const result = await handler({ collectionName: 'API', requestName: 'GetUser' }, ctx);
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text);
    expect(data.count).toBe(2);
    expect(data.examples[0].name).toBe('200 OK');
    expect(data.examples[1].status).toBe(404);
  });

  it('returns empty array when no examples', async () => {
    const ctx = makeContext();
    (ctx.collectionManager.listExamples as any).mockResolvedValue([]);
    const result = await handler({ collectionName: 'API', requestName: 'Ping' }, ctx);
    const data = JSON.parse(result.content[0].text);
    expect(data.count).toBe(0);
    expect(data.examples).toEqual([]);
  });

  it('returns error on failure', async () => {
    const ctx = makeContext();
    (ctx.collectionManager.listExamples as any).mockRejectedValue(new Error('not found'));
    const result = await handler({ collectionName: 'X', requestName: 'Y' }, ctx);
    expect(result.isError).toBe(true);
  });
});
