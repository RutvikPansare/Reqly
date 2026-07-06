import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BitwardenSecretsProvider, parseBwUri } from './bitwarden.js';

function makeMockClient(secrets: Array<{ id: string; key: string; value: string; projectId: string }>, projects: Array<{ id: string; name: string }>) {
  const loginAccessToken = vi.fn().mockResolvedValue(undefined);
  // The real SDK requires organizationId on both list calls - mirror that
  // strictness so the provider can't regress to calling list() bare.
  const secretsList = vi.fn().mockImplementation(async (organizationId: string) => {
    if (!organizationId) throw new Error('organizationId is required');
    return { data: secrets.map(s => ({ id: s.id, key: s.key, organizationId })) };
  });
  const projectsList = vi.fn().mockImplementation(async (organizationId: string) => {
    if (!organizationId) throw new Error('organizationId is required');
    return { data: projects };
  });
  return {
    loginAccessToken,
    secretsList,
    projectsList,
    client: {
      auth: () => ({ loginAccessToken }),
      secrets: () => ({
        list: secretsList,
        get: vi.fn().mockImplementation(async (id: string) => {
          const s = secrets.find(x => x.id === id);
          if (!s) throw new Error('secret not found');
          return { id: s.id, key: s.key, value: s.value, projectId: s.projectId, organizationId: 'org-1' };
        }),
      }),
      projects: () => ({
        list: projectsList,
      }),
    },
  };
}

describe('parseBwUri', () => {
  it('parses bw://project-name/secret-name', () => {
    expect(parseBwUri('bw://myproject/stripe-key')).toEqual({ project: 'myproject', secret: 'stripe-key' });
  });

  it('throws on missing secret name', () => {
    expect(() => parseBwUri('bw://myproject')).toThrow(/bw:\/\/project-name\/secret-name/);
  });

  it('throws on empty parts', () => {
    expect(() => parseBwUri('bw:///secret')).toThrow(/bw:\/\/project-name\/secret-name/);
    expect(() => parseBwUri('bw://proj/')).toThrow(/bw:\/\/project-name\/secret-name/);
  });
});

describe('BitwardenSecretsProvider', () => {
  const origToken = process.env.BITWARDENSM_ACCESS_TOKEN;
  const origOrg = process.env.BITWARDENSM_ORGANIZATION_ID;

  beforeEach(() => {
    delete process.env.BITWARDENSM_ACCESS_TOKEN;
    delete process.env.BITWARDENSM_ORGANIZATION_ID;
  });

  afterEach(() => {
    if (origToken === undefined) delete process.env.BITWARDENSM_ACCESS_TOKEN;
    else process.env.BITWARDENSM_ACCESS_TOKEN = origToken;
    if (origOrg === undefined) delete process.env.BITWARDENSM_ORGANIZATION_ID;
    else process.env.BITWARDENSM_ORGANIZATION_ID = origOrg;
  });

  const orgConfig = { secretProviders: { bitwarden: { organizationId: 'org-1' } } };

  it('has the bw:// prefix', () => {
    const provider = new BitwardenSecretsProvider({ loadConfig: async () => ({}) });
    expect(provider.prefix).toBe('bw://');
  });

  it('errors clearly when no token is configured', async () => {
    const provider = new BitwardenSecretsProvider({ loadConfig: async () => ({}) });
    await expect(provider.resolve('bw://proj/key')).rejects.toThrow(
      /Set BITWARDENSM_ACCESS_TOKEN or configure secretProviders\.bitwarden\.accessToken/
    );
  });

  it('errors clearly when no organization id is configured', async () => {
    process.env.BITWARDENSM_ACCESS_TOKEN = 'tok';
    const provider = new BitwardenSecretsProvider({ loadConfig: async () => ({}) });
    await expect(provider.resolve('bw://proj/key')).rejects.toThrow(
      /Set BITWARDENSM_ORGANIZATION_ID or configure secretProviders\.bitwarden\.organizationId/
    );
  });

  it('uses the env var token over config token', async () => {
    process.env.BITWARDENSM_ACCESS_TOKEN = 'env-token';
    const mock = makeMockClient(
      [{ id: 's1', key: 'api-key', value: 'sk-live-9999', projectId: 'p1' }],
      [{ id: 'p1', name: 'myproject' }]
    );
    const provider = new BitwardenSecretsProvider({
      loadConfig: async () => ({ secretProviders: { bitwarden: { accessToken: 'config-token', organizationId: 'org-1' } } }),
      clientFactory: async () => mock.client as any,
    });
    await provider.resolve('bw://myproject/api-key');
    expect(mock.loginAccessToken).toHaveBeenCalledWith('env-token');
  });

  it('falls back to config token when env var is absent', async () => {
    const mock = makeMockClient(
      [{ id: 's1', key: 'api-key', value: 'sk-live-9999', projectId: 'p1' }],
      [{ id: 'p1', name: 'myproject' }]
    );
    const provider = new BitwardenSecretsProvider({
      loadConfig: async () => ({ secretProviders: { bitwarden: { accessToken: 'config-token', organizationId: 'org-1' } } }),
      clientFactory: async () => mock.client as any,
    });
    await provider.resolve('bw://myproject/api-key');
    expect(mock.loginAccessToken).toHaveBeenCalledWith('config-token');
  });

  it('passes the organization id to both SDK list calls, env var winning over config', async () => {
    process.env.BITWARDENSM_ACCESS_TOKEN = 'tok';
    process.env.BITWARDENSM_ORGANIZATION_ID = 'env-org';
    const mock = makeMockClient(
      [{ id: 's1', key: 'api-key', value: 'v', projectId: 'p1' }],
      [{ id: 'p1', name: 'myproject' }]
    );
    const provider = new BitwardenSecretsProvider({
      loadConfig: async () => ({ secretProviders: { bitwarden: { organizationId: 'config-org' } } }),
      clientFactory: async () => mock.client as any,
    });
    await provider.resolve('bw://myproject/api-key');
    expect(mock.secretsList).toHaveBeenCalledWith('env-org');
    expect(mock.projectsList).toHaveBeenCalledWith('env-org');
  });

  it('resolves a secret by project name and secret name', async () => {
    process.env.BITWARDENSM_ACCESS_TOKEN = 'tok';
    const mock = makeMockClient(
      [
        { id: 's1', key: 'api-key', value: 'wrong-project-value', projectId: 'p2' },
        { id: 's2', key: 'api-key', value: 'sk-live-9999', projectId: 'p1' },
      ],
      [{ id: 'p1', name: 'myproject' }, { id: 'p2', name: 'other' }]
    );
    const provider = new BitwardenSecretsProvider({
      loadConfig: async () => orgConfig,
      clientFactory: async () => mock.client as any,
    });
    await expect(provider.resolve('bw://myproject/api-key')).resolves.toBe('sk-live-9999');
  });

  it('errors when the secret name does not exist', async () => {
    process.env.BITWARDENSM_ACCESS_TOKEN = 'tok';
    const mock = makeMockClient([], []);
    const provider = new BitwardenSecretsProvider({
      loadConfig: async () => orgConfig,
      clientFactory: async () => mock.client as any,
    });
    await expect(provider.resolve('bw://myproject/nope')).rejects.toThrow(/No secret named "nope"/);
  });

  it('errors when the project name does not match', async () => {
    process.env.BITWARDENSM_ACCESS_TOKEN = 'tok';
    const mock = makeMockClient(
      [{ id: 's1', key: 'api-key', value: 'v', projectId: 'p2' }],
      [{ id: 'p2', name: 'other' }]
    );
    const provider = new BitwardenSecretsProvider({
      loadConfig: async () => orgConfig,
      clientFactory: async () => mock.client as any,
    });
    await expect(provider.resolve('bw://myproject/api-key')).rejects.toThrow(/project "myproject"/);
  });
});
