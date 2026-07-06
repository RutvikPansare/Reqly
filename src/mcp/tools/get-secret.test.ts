import { describe, it, expect, vi } from 'vitest';
import { definition, handler } from './get-secret.js';

function makeContext(overrides: any = {}) {
  return {
    secretRegistry: {
      resolve: vi.fn().mockResolvedValue('sk-test-abcdef123456'),
    },
    ...overrides,
  };
}

describe('get_secret', () => {
  it('has correct definition', () => {
    expect(definition.name).toBe('get_secret');
    expect(definition.inputSchema.required).toEqual(['uri']);
    expect(definition.description).toMatch(/preview/i);
  });

  it('resolves a URI and returns only a truncated preview, never the full value', async () => {
    const ctx = makeContext();
    const res = await handler({ uri: 'bw://proj/key' }, ctx as any);
    expect(ctx.secretRegistry.resolve).toHaveBeenCalledWith('bw://proj/key');
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toEqual({ resolved: true, preview: 'sk-t...' });
    expect(res.content[0].text).not.toContain('abcdef123456');
    expect(res.isError).toBeFalsy();
  });

  it('previews short values without leaking full length', async () => {
    const ctx = makeContext({ secretRegistry: { resolve: vi.fn().mockResolvedValue('abc') } });
    const res = await handler({ uri: 'bw://p/s' }, ctx as any);
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toEqual({ resolved: true, preview: 'abc...' });
  });

  it('returns isError with the provider message on failure', async () => {
    const ctx = makeContext({
      secretRegistry: { resolve: vi.fn().mockRejectedValue(new Error('Set BITWARDENSM_ACCESS_TOKEN or configure secretProviders.bitwarden.accessToken in ~/.reqly/config.json')) },
    });
    const res = await handler({ uri: 'bw://p/s' }, ctx as any);
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('BITWARDENSM_ACCESS_TOKEN');
  });

  it('errors when the secret registry is unavailable', async () => {
    const res = await handler({ uri: 'bw://p/s' }, {} as any);
    expect(res.isError).toBe(true);
  });
});
