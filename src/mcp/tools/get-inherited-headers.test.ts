import { describe, it, expect, vi } from 'vitest';
import { handler, definition } from './get-inherited-headers.js';
import type { EngineContext } from './types.js';

describe('get_inherited_headers tool', () => {
  it('has a name and description', () => {
    expect(definition.name).toBe('get_inherited_headers');
    expect(definition.description.length).toBeGreaterThan(20);
  });

  it('returns Bearer header for bearer auth', async () => {
    const ctx = {
      authManager: {
        getProfile: vi.fn().mockResolvedValue({
          id: 'p1', name: 'My API', type: 'bearer',
          credentials: { token: 'abc123' },
        }),
      },
    } as unknown as EngineContext;
    const result = await handler({ authType: 'bearer', authCreds: { token: 'abc123' } }, ctx);
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.headers['Authorization']).toMatch(/^Bearer /);
  });

  it('returns Authorization header for basic auth', async () => {
    const ctx = { authManager: { getProfile: vi.fn() } } as unknown as EngineContext;
    const result = await handler({ authType: 'basic', authCreds: { username: 'user', password: 'pass' } }, ctx);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.headers['Authorization']).toMatch(/^Basic /);
  });

  it('returns header for api_key in header position', async () => {
    const ctx = { authManager: { getProfile: vi.fn() } } as unknown as EngineContext;
    const result = await handler({ authType: 'api_key', authCreds: { key: 'X-Api-Key', value: 'secret', in: 'header' } }, ctx);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.headers['X-Api-Key']).toBe('secret');
  });

  it('returns empty headers for no auth', async () => {
    const ctx = { authManager: { getProfile: vi.fn() } } as unknown as EngineContext;
    const result = await handler({ authType: 'none' }, ctx);
    const parsed = JSON.parse(result.content[0].text);
    expect(Object.keys(parsed.headers)).toHaveLength(0);
  });
});
