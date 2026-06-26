import { describe, it, expect, vi } from 'vitest';
import { handler } from './save-example.js';
import type { EngineContext } from './types.js';

const savedExample = {
  id: 'ex-1',
  name: 'Success 200',
  status: 200,
  headers: { 'content-type': 'application/json' },
  body: { id: 1 },
  latency: 80,
  savedAt: '2026-06-25T00:00:00.000Z',
};

function makeContext(): EngineContext {
  return {
    collectionManager: {
      saveExample: vi.fn().mockResolvedValue(savedExample),
    },
  } as unknown as EngineContext;
}

describe('save_example tool', () => {
  it('saves an example and returns its id and name', async () => {
    const ctx = makeContext();
    const result = await handler(
      { collectionName: 'API', requestName: 'GetUser', exampleName: 'Success 200', status: 200, body: { id: 1 }, headers: {}, latency: 80 },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text);
    expect(data.id).toBe('ex-1');
    expect(data.name).toBe('Success 200');
  });

  it('returns error on failure', async () => {
    const ctx = makeContext();
    (ctx.collectionManager.saveExample as any).mockRejectedValue(new Error('not found'));
    const result = await handler({ collectionName: 'X', requestName: 'Y', exampleName: 'Z', status: 200, body: null, headers: {}, latency: 0 }, ctx);
    expect(result.isError).toBe(true);
  });
});
