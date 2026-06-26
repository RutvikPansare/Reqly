import { describe, it, expect, vi } from 'vitest';
import * as getColVars from './get-collection-variables.js';
import * as setColVar from './set-collection-variable.js';
import * as delColVar from './delete-collection-variable.js';

describe('get_collection_variables', () => {
  it('has the correct definition', () => {
    expect(getColVars.definition.name).toBe('get_collection_variables');
    expect(getColVars.definition.inputSchema.required).toContain('collectionName');
  });

  it('returns variables as a key/value list', async () => {
    const ctx: any = {
      collectionManager: {
        getCollectionVariables: vi.fn().mockResolvedValue({ baseUrl: 'https://x', token: 't' }),
      },
    };
    const res = await getColVars.handler({ collectionName: 'API' }, ctx);
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toEqual([{ key: 'baseUrl', value: 'https://x' }, { key: 'token', value: 't' }]);
    expect(ctx.collectionManager.getCollectionVariables).toHaveBeenCalledWith('API');
  });

  it('returns isError when the collection is missing', async () => {
    const ctx: any = {
      collectionManager: {
        getCollectionVariables: vi.fn().mockRejectedValue(new Error('Collection API not found')),
      },
    };
    const res = await getColVars.handler({ collectionName: 'API' }, ctx);
    expect(res.isError).toBe(true);
  });
});

describe('set_collection_variable', () => {
  it('has the correct definition', () => {
    expect(setColVar.definition.name).toBe('set_collection_variable');
    expect(setColVar.definition.inputSchema.required).toEqual(
      expect.arrayContaining(['collectionName', 'key', 'value']),
    );
  });

  it('sets a collection variable', async () => {
    const ctx: any = {
      collectionManager: { setCollectionVariable: vi.fn().mockResolvedValue(undefined) },
    };
    const res = await setColVar.handler({ collectionName: 'API', key: 'baseUrl', value: 'https://x' }, ctx);
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.success).toBe(true);
    expect(ctx.collectionManager.setCollectionVariable).toHaveBeenCalledWith('API', 'baseUrl', 'https://x');
  });

  it('returns isError on failure', async () => {
    const ctx: any = {
      collectionManager: { setCollectionVariable: vi.fn().mockRejectedValue(new Error('nope')) },
    };
    const res = await setColVar.handler({ collectionName: 'X', key: 'a', value: 'b' }, ctx);
    expect(res.isError).toBe(true);
  });
});

describe('delete_collection_variable', () => {
  it('has the correct definition', () => {
    expect(delColVar.definition.name).toBe('delete_collection_variable');
    expect(delColVar.definition.inputSchema.required).toEqual(
      expect.arrayContaining(['collectionName', 'key']),
    );
  });

  it('deletes a collection variable', async () => {
    const ctx: any = {
      collectionManager: { deleteCollectionVariable: vi.fn().mockResolvedValue(undefined) },
    };
    const res = await delColVar.handler({ collectionName: 'API', key: 'baseUrl' }, ctx);
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.success).toBe(true);
    expect(ctx.collectionManager.deleteCollectionVariable).toHaveBeenCalledWith('API', 'baseUrl');
  });
});
