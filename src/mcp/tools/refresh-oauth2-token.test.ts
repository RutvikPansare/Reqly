import { describe, it, expect, vi } from 'vitest';
import { handler, definition } from './refresh-oauth2-token.js';
import type { EngineContext } from './types.js';

describe('refresh_oauth2_token tool', () => {
  it('has a name and description', () => {
    expect(definition.name).toBe('refresh_oauth2_token');
    expect(definition.description.length).toBeGreaterThan(20);
  });

  it('calls refreshOAuth2Token on authManager and returns the updated profile', async () => {
    const updatedProfile = { id: 'p1', name: 'My API', type: 'oauth2', credentials: { accessToken: 'new_token', expiresAt: '9999999999000' } };
    const ctx = {
      authManager: {
        refreshOAuth2Token: vi.fn().mockResolvedValue(updatedProfile),
      },
    } as unknown as EngineContext;
    const result = await handler({ profileId: 'p1' }, ctx);
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.profileId).toBe('p1');
    expect(parsed.accessToken).toBe('new_token');
  });

  it('returns error when profileId is missing', async () => {
    const ctx = { authManager: { refreshOAuth2Token: vi.fn() } } as unknown as EngineContext;
    const result = await handler({}, ctx);
    expect(result.isError).toBe(true);
  });

  it('returns error when refresh fails', async () => {
    const ctx = {
      authManager: {
        refreshOAuth2Token: vi.fn().mockRejectedValue(new Error('No refresh token')),
      },
    } as unknown as EngineContext;
    const result = await handler({ profileId: 'p1' }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No refresh token');
  });
});
