import { describe, it, expect, vi } from 'vitest';
import { definition as statusDef, handler as statusHandler } from './get-secret-status.js';
import { definition as configureDef, handler as configureHandler } from './configure-secret-provider.js';

describe('get_secret_status', () => {
  it('has correct definition', () => {
    expect(statusDef.name).toBe('get_secret_status');
    expect(statusDef.description).toMatch(/vault/i);
  });

  it('returns the dotenv secret status list without values', async () => {
    const ctx = {
      dotEnvLoader: {
        getSecretStatus: vi.fn().mockReturnValue([
          { key: 'GOOD', uri: 'bw://p/s', source: '.env', status: 'resolved' },
          { key: 'BAD', uri: 'op://v/i/f', source: '.env', status: 'error', error: 'provider not configured' },
        ]),
      },
    };
    const res = await statusHandler({}, ctx as any);
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.secrets).toHaveLength(2);
    expect(parsed.secrets[0]).toEqual({ key: 'GOOD', uri: 'bw://p/s', source: '.env', status: 'resolved' });
    expect(res.isError).toBeFalsy();
  });

  it('errors when the loader does not support secret status', async () => {
    const res = await statusHandler({}, { dotEnvLoader: {} } as any);
    expect(res.isError).toBe(true);
  });
});

describe('configure_secret_provider', () => {
  function makeContext() {
    return {
      authManager: { setSecretProviderConfig: vi.fn().mockResolvedValue(undefined) },
      dotEnvLoader: {
        load: vi.fn().mockResolvedValue(undefined),
        getSecretStatus: vi.fn().mockReturnValue([{ key: 'A', uri: 'bw://p/s', source: '.env', status: 'resolved' }]),
      },
    };
  }

  it('has correct definition', () => {
    expect(configureDef.name).toBe('configure_secret_provider');
    expect(configureDef.inputSchema.required).toEqual(['provider', 'config']);
  });

  it('persists provider config, reloads .env resolution, and returns the new status', async () => {
    const ctx = makeContext();
    const res = await configureHandler({ provider: 'bitwarden', config: { accessToken: 't', organizationId: 'o' } }, ctx as any);
    expect(ctx.authManager.setSecretProviderConfig).toHaveBeenCalledWith('bitwarden', { accessToken: 't', organizationId: 'o' });
    expect(ctx.dotEnvLoader.load).toHaveBeenCalled();
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toEqual({ provider: 'bitwarden', configured: true, secrets: [{ key: 'A', uri: 'bw://p/s', source: '.env', status: 'resolved' }] });
  });

  it('rejects unknown provider names', async () => {
    const ctx = makeContext();
    const res = await configureHandler({ provider: 'nope', config: {} }, ctx as any);
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/bitwarden/);
  });

  it('never echoes config values back in the response', async () => {
    const ctx = makeContext();
    const res = await configureHandler({ provider: 'bitwarden', config: { accessToken: 'super-secret-token' } }, ctx as any);
    expect(res.content[0].text).not.toContain('super-secret-token');
  });
});
