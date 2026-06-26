import { describe, it, expect, vi } from 'vitest';
import * as getColAuth from './get-collection-auth.js';
import * as setColAuth from './set-collection-auth.js';
import * as delColAuth from './delete-collection-auth.js';

describe('get_collection_auth', () => {
  it('has the correct definition', () => {
    expect(getColAuth.definition.name).toBe('get_collection_auth');
    expect(getColAuth.definition.inputSchema.required).toContain('collectionName');
  });

  it('returns the collection auth config when set', async () => {
    const authConfig = { type: 'bearer', credentials: { token: 'tok123' } };
    const ctx: any = {
      collectionManager: {
        getCollectionAuth: vi.fn().mockResolvedValue(authConfig),
      },
    };
    const res = await getColAuth.handler({ collectionName: 'MyAPI' }, ctx);
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toEqual(authConfig);
    expect(ctx.collectionManager.getCollectionAuth).toHaveBeenCalledWith('MyAPI');
  });

  it('returns null when no auth is configured', async () => {
    const ctx: any = {
      collectionManager: {
        getCollectionAuth: vi.fn().mockResolvedValue(undefined),
      },
    };
    const res = await getColAuth.handler({ collectionName: 'MyAPI' }, ctx);
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toBeNull();
  });

  it('returns isError when the collection is missing', async () => {
    const ctx: any = {
      collectionManager: {
        getCollectionAuth: vi.fn().mockRejectedValue(new Error('Collection MyAPI not found')),
      },
    };
    const res = await getColAuth.handler({ collectionName: 'MyAPI' }, ctx);
    expect(res.isError).toBe(true);
  });
});

describe('set_collection_auth', () => {
  it('has the correct definition', () => {
    expect(setColAuth.definition.name).toBe('set_collection_auth');
    expect(setColAuth.definition.inputSchema.required).toEqual(
      expect.arrayContaining(['collectionName', 'type']),
    );
  });

  it('sets bearer auth with a token', async () => {
    const ctx: any = {
      collectionManager: { setCollectionAuth: vi.fn().mockResolvedValue(undefined) },
    };
    const res = await setColAuth.handler(
      { collectionName: 'MyAPI', type: 'bearer', credentials: { token: 'tok123' } },
      ctx,
    );
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.success).toBe(true);
    expect(ctx.collectionManager.setCollectionAuth).toHaveBeenCalledWith('MyAPI', {
      type: 'bearer',
      credentials: { token: 'tok123' },
    });
  });

  it('sets auth via profileId reference', async () => {
    const ctx: any = {
      collectionManager: { setCollectionAuth: vi.fn().mockResolvedValue(undefined) },
    };
    const res = await setColAuth.handler(
      { collectionName: 'MyAPI', type: 'bearer', profileId: 'profile-1' },
      ctx,
    );
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.success).toBe(true);
    expect(ctx.collectionManager.setCollectionAuth).toHaveBeenCalledWith('MyAPI', {
      type: 'bearer',
      profileId: 'profile-1',
    });
  });

  it('sets type:none to suppress collection auth', async () => {
    const ctx: any = {
      collectionManager: { setCollectionAuth: vi.fn().mockResolvedValue(undefined) },
    };
    const res = await setColAuth.handler({ collectionName: 'MyAPI', type: 'none' }, ctx);
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.success).toBe(true);
    expect(ctx.collectionManager.setCollectionAuth).toHaveBeenCalledWith('MyAPI', { type: 'none' });
  });

  it('returns isError on failure', async () => {
    const ctx: any = {
      collectionManager: { setCollectionAuth: vi.fn().mockRejectedValue(new Error('not found')) },
    };
    const res = await setColAuth.handler({ collectionName: 'X', type: 'bearer' }, ctx);
    expect(res.isError).toBe(true);
  });
});

describe('delete_collection_auth', () => {
  it('has the correct definition', () => {
    expect(delColAuth.definition.name).toBe('delete_collection_auth');
    expect(delColAuth.definition.inputSchema.required).toContain('collectionName');
  });

  it('deletes collection auth', async () => {
    const ctx: any = {
      collectionManager: { deleteCollectionAuth: vi.fn().mockResolvedValue(undefined) },
    };
    const res = await delColAuth.handler({ collectionName: 'MyAPI' }, ctx);
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.success).toBe(true);
    expect(ctx.collectionManager.deleteCollectionAuth).toHaveBeenCalledWith('MyAPI');
  });

  it('returns isError on failure', async () => {
    const ctx: any = {
      collectionManager: { deleteCollectionAuth: vi.fn().mockRejectedValue(new Error('nope')) },
    };
    const res = await delColAuth.handler({ collectionName: 'X' }, ctx);
    expect(res.isError).toBe(true);
  });
});
