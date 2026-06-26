import { describe, it, expect, vi } from 'vitest';
import { resolveCollectionAuth } from './collection-auth.js';
import { AuthType } from '../types/index.js';

describe('resolveCollectionAuth', () => {
  it('returns undefined when collectionAuth is undefined', async () => {
    const authManager: any = {};
    const result = await resolveCollectionAuth(undefined, authManager);
    expect(result).toBeUndefined();
  });

  it('returns undefined when collectionAuth type is none', async () => {
    const authManager: any = {};
    const result = await resolveCollectionAuth({ type: 'none' }, authManager);
    expect(result).toBeUndefined();
  });

  it('returns the saved profile when profileId is provided', async () => {
    const profile = { id: 'p1', name: 'Prod', type: AuthType.BEARER, credentials: { token: 'abc' } };
    const authManager: any = {
      getProfile: vi.fn().mockResolvedValue(profile),
    };
    const result = await resolveCollectionAuth({ type: 'bearer', profileId: 'p1' }, authManager);
    expect(result).toEqual(profile);
    expect(authManager.getProfile).toHaveBeenCalledWith('p1');
  });

  it('falls back to inline credentials when profileId lookup fails', async () => {
    const authManager: any = {
      getProfile: vi.fn().mockRejectedValue(new Error('not found')),
    };
    const result = await resolveCollectionAuth(
      { type: 'bearer', profileId: 'missing', credentials: { token: 'fallback' } },
      authManager,
    );
    expect(result).toEqual({
      id: 'collection',
      name: 'collection',
      type: AuthType.BEARER,
      credentials: { token: 'fallback' },
    });
  });

  it('returns inline credentials when no profileId is provided', async () => {
    const authManager: any = {};
    const result = await resolveCollectionAuth(
      { type: 'apiKey', credentials: { key: 'mykey' } },
      authManager,
    );
    expect(result).toEqual({
      id: 'collection',
      name: 'collection',
      type: AuthType.API_KEY,
      credentials: { key: 'mykey' },
    });
  });

  it('returns empty credentials object when no credentials are provided', async () => {
    const authManager: any = {};
    const result = await resolveCollectionAuth({ type: 'bearer' }, authManager);
    expect(result).toEqual({
      id: 'collection',
      name: 'collection',
      type: AuthType.BEARER,
      credentials: {},
    });
  });
});
