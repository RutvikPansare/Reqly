import { describe, it, expect, vi } from 'vitest';
import { definition, handler } from './move-request.js';

describe('move_request', () => {
  it('should have correct definition', () => {
    expect(definition.name).toBe('move_request');
    expect(definition.inputSchema.required).toEqual(['collection', 'request', 'targetCollection']);
  });

  it('should move a request and return the final name and target collection', async () => {
    const context = {
      collectionManager: {
        moveRequest: vi.fn().mockResolvedValue({ name: 'GetUser', collection: 'Target' }),
      },
    };
    const res = await handler({ collection: 'Source', request: 'GetUser', targetCollection: 'Target' }, context as any);
    expect(context.collectionManager.moveRequest).toHaveBeenCalledWith('Source', 'GetUser', 'Target');
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toEqual({ name: 'GetUser', collection: 'Target' });
  });

  it('should return a structured error when the source request is missing', async () => {
    const context = {
      collectionManager: {
        moveRequest: vi.fn().mockRejectedValue(new Error('Request Missing not found in collection Source')),
      },
    };
    const res = await handler({ collection: 'Source', request: 'Missing', targetCollection: 'Target' }, context as any);
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/not found/);
  });
});
