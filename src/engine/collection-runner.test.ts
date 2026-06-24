import { describe, it, expect, vi } from 'vitest';
import { CollectionRunner } from './collection-runner.js';

describe('CollectionRunner', () => {
  it('should run collection sequentially and stop on failure', async () => {
    const mockContext: any = {
      collectionManager: {
        getCollection: vi.fn().mockResolvedValue({
          name: 'test-collection',
          requests: [
            { name: 'req1', assertions: [{ field: 'status', operator: 'eq', value: 200 }] },
            { name: 'req2', assertions: [{ field: 'status', operator: 'eq', value: 200 }] },
            { name: 'req3' } // Should not be reached if stopOnFailure is true and req2 fails
          ]
        })
      },
      authManager: { getProfile: vi.fn() },
      executeRequest: vi.fn()
        .mockResolvedValueOnce({ status: 200, latency: 10, headers: {}, body: null })
        .mockResolvedValueOnce({ status: 500, latency: 10, headers: {}, body: null }),
      responseStore: { set: () => {}, get: () => undefined }, historyStore: { append: () => {} }
    };

    const runner = new CollectionRunner(mockContext);
    const result = await runner.run('test-collection', { stopOnFailure: true });

    expect(result.collection).toBe('test-collection');
    expect(result.total).toBe(3);
    expect(result.passed).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.results).toHaveLength(2); // Stopped early
    expect(result.results[0].passed).toBe(true);
    expect(result.results[1].passed).toBe(false);
  });
});
