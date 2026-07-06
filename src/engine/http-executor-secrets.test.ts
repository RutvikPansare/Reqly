import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execute, RequestError } from './http-executor.js';
import { RequestConfig } from '../types/index.js';
import { SecretProviderRegistry } from './secret-providers/index.js';

vi.mock('undici', () => ({
  fetch: vi.fn(),
  Agent: vi.fn(),
}));

import { fetch } from 'undici';

function okResponse() {
  return {
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    arrayBuffer: vi.fn().mockResolvedValue(new TextEncoder().encode('{}').buffer),
  };
}

function makeRegistry() {
  const registry = new SecretProviderRegistry();
  registry.register({ prefix: 'bw://', resolve: async (uri: string) => `val-of(${uri})` });
  return registry;
}

// execute(config, env, auth, truncate, maxBodyBytes, collectionVars, collectionAuth,
//         dotEnvVars, baseDir, resolvedFiles, scriptVars, onScriptVarSet, runnerContext, secrets)
function run(config: RequestConfig, dotEnvVars: Record<string, string>, secrets: any) {
  return execute(config, undefined, undefined, true, 50 * 1024, {}, undefined, dotEnvVars, undefined, undefined, {}, undefined, undefined, secrets);
}

describe('http-executor secrets (T-245)', () => {
  beforeEach(() => {
    vi.mocked(fetch).mockReset();
    vi.mocked(fetch).mockResolvedValue(okResponse() as any);
  });

  it('resolves an inline {{secret:...}} reference in the URL', async () => {
    const config: RequestConfig = { method: 'GET', url: 'http://x.com/?key={{secret:bw://proj/api-key}}' };
    await run(config, {}, { registry: makeRegistry() });
    expect(fetch).toHaveBeenCalledWith('http://x.com/?key=val-of(bw://proj/api-key)', expect.anything());
  });

  it('resolves inline secret references in headers and string bodies', async () => {
    const config: RequestConfig = {
      method: 'POST',
      url: 'http://x.com',
      headers: { Authorization: 'Bearer {{secret:bw://proj/token}}' },
      body: '{"pw":"{{secret:bw://proj/db-pass}}"}',
    };
    await run(config, {}, { registry: makeRegistry() });
    const call = vi.mocked(fetch).mock.calls[0][1] as any;
    expect(call.headers.Authorization).toBe('Bearer val-of(bw://proj/token)');
    expect(call.body).toBe('{"pw":"val-of(bw://proj/db-pass)"}');
  });

  it('throws a RequestError when an inline secret cannot be resolved', async () => {
    const config: RequestConfig = { method: 'GET', url: 'http://x.com/{{secret:op://v/i/f}}' };
    await expect(run(config, {}, { registry: makeRegistry() })).rejects.toThrow(RequestError);
    await expect(run(config, {}, { registry: makeRegistry() })).rejects.toThrow(/op:\/\/.*not configured/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('throws a RequestError when an inline secret is used without a registry', async () => {
    const config: RequestConfig = { method: 'GET', url: 'http://x.com/{{secret:bw://p/s}}' };
    await expect(run(config, {}, undefined)).rejects.toThrow(/secret provider/i);
  });

  it('fails loudly when the request references a .env key whose vault resolution failed', async () => {
    const config: RequestConfig = { method: 'GET', url: 'http://x.com/?key={{STRIPE_KEY}}' };
    const secrets = { dotEnvErrors: { STRIPE_KEY: 'The 1Password (op://) secret provider is not configured.' } };
    await expect(run(config, {}, secrets)).rejects.toThrow(RequestError);
    await expect(run(config, {}, secrets)).rejects.toThrow(/STRIPE_KEY.*not configured/is);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not fail when a failed .env key exists but the request never references it', async () => {
    const config: RequestConfig = { method: 'GET', url: 'http://x.com/plain' };
    const secrets = { dotEnvErrors: { STRIPE_KEY: 'provider not configured' } };
    const result = await run(config, {}, secrets);
    expect(result.status).toBe(200);
  });

  it('resolved .env secrets flow through the normal variable chain', async () => {
    const config: RequestConfig = { method: 'GET', url: 'http://x.com/?key={{STRIPE_KEY}}' };
    await run(config, { STRIPE_KEY: 'sk-live-123' }, { registry: makeRegistry() });
    expect(fetch).toHaveBeenCalledWith('http://x.com/?key=sk-live-123', expect.anything());
  });
});
