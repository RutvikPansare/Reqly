import { describe, it, expect, vi } from 'vitest';
import { definition, handler } from './duplicate-collection.js';

describe('duplicate_collection', () => {
  it('should have correct definition', () => {
    expect(definition.name).toBe('duplicate_collection');
    expect(definition.inputSchema.required).toEqual(['name']);
  });

  it('should duplicate a collection and return the copy', async () => {
    const context = {
      collectionManager: {
        duplicateCollection: vi.fn().mockResolvedValue({ name: 'Copy of Demo', requests: [] }),
      },
    };
    const res = await handler({ name: 'Demo' }, context as any);
    expect(context.collectionManager.duplicateCollection).toHaveBeenCalledWith('Demo');
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toEqual({ name: 'Copy of Demo', requests: [] });
  });

  it('should return a structured error when the source collection is missing', async () => {
    const context = {
      collectionManager: {
        duplicateCollection: vi.fn().mockRejectedValue(new Error('Collection Missing not found')),
      },
    };
    const res = await handler({ name: 'Missing' }, context as any);
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/not found/);
  });
});
