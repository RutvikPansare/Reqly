import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HashiCorpVaultProvider, parseVaultUri } from './vault.js';

describe('parseVaultUri', () => {
  it('parses vault://secret/data/myapp/db_password into API path + field', () => {
    expect(parseVaultUri('vault://secret/data/myapp/db_password')).toEqual({
      apiPath: 'secret/data/myapp',
      field: 'db_password',
    });
  });

  it('supports nested KV paths', () => {
    expect(parseVaultUri('vault://secret/data/team/service/prod/api_key')).toEqual({
      apiPath: 'secret/data/team/service/prod',
      field: 'api_key',
    });
  });

  it('throws on too few segments', () => {
    expect(() => parseVaultUri('vault://secret/data/db_password')).toThrow(/vault:\/\/<mount>\/data\/<path>\/<field>/);
    expect(() => parseVaultUri('vault://secret')).toThrow(/vault:\/\/<mount>\/data\/<path>\/<field>/);
  });
});

describe('HashiCorpVaultProvider', () => {
  const origAddr = process.env.VAULT_ADDR;
  const origToken = process.env.VAULT_TOKEN;

  beforeEach(() => {
    delete process.env.VAULT_ADDR;
    delete process.env.VAULT_TOKEN;
  });

  afterEach(() => {
    if (origAddr === undefined) delete process.env.VAULT_ADDR; else process.env.VAULT_ADDR = origAddr;
    if (origToken === undefined) delete process.env.VAULT_TOKEN; else process.env.VAULT_TOKEN = origToken;
  });

  function makeFetch(status = 200, body: any = { data: { data: { db_password: 'hunter2' } } }) {
    return vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    });
  }

  it('has the vault:// prefix', () => {
    const provider = new HashiCorpVaultProvider({ loadConfig: async () => ({}) });
    expect(provider.prefix).toBe('vault://');
  });

  it('errors clearly when address or token is missing', async () => {
    const provider = new HashiCorpVaultProvider({ loadConfig: async () => ({}) });
    await expect(provider.resolve('vault://secret/data/myapp/db_password')).rejects.toThrow(
      /Set VAULT_ADDR and VAULT_TOKEN or configure secretProviders\.vault/
    );
  });

  it('reads the KV v2 endpoint with the token header and returns the field', async () => {
    process.env.VAULT_ADDR = 'http://vault.local:8200';
    process.env.VAULT_TOKEN = 'tok-123';
    const fetchImpl = makeFetch();
    const provider = new HashiCorpVaultProvider({ loadConfig: async () => ({}), fetchImpl });
    await expect(provider.resolve('vault://secret/data/myapp/db_password')).resolves.toBe('hunter2');
    expect(fetchImpl).toHaveBeenCalledWith('http://vault.local:8200/v1/secret/data/myapp', {
      headers: { 'X-Vault-Token': 'tok-123' },
    });
  });

  it('strips a trailing slash from the address', async () => {
    process.env.VAULT_ADDR = 'http://vault.local:8200/';
    process.env.VAULT_TOKEN = 'tok';
    const fetchImpl = makeFetch();
    const provider = new HashiCorpVaultProvider({ loadConfig: async () => ({}), fetchImpl });
    await provider.resolve('vault://secret/data/myapp/db_password');
    expect(fetchImpl.mock.calls[0][0]).toBe('http://vault.local:8200/v1/secret/data/myapp');
  });

  it('env vars take precedence over config values', async () => {
    process.env.VAULT_ADDR = 'http://env:8200';
    process.env.VAULT_TOKEN = 'env-tok';
    const fetchImpl = makeFetch();
    const provider = new HashiCorpVaultProvider({
      loadConfig: async () => ({ secretProviders: { vault: { address: 'http://cfg:8200', token: 'cfg-tok' } } }),
      fetchImpl,
    });
    await provider.resolve('vault://secret/data/myapp/db_password');
    expect(fetchImpl).toHaveBeenCalledWith('http://env:8200/v1/secret/data/myapp', {
      headers: { 'X-Vault-Token': 'env-tok' },
    });
  });

  it('falls back to config address + token', async () => {
    const fetchImpl = makeFetch();
    const provider = new HashiCorpVaultProvider({
      loadConfig: async () => ({ secretProviders: { vault: { address: 'http://cfg:8200', token: 'cfg-tok' } } }),
      fetchImpl,
    });
    await provider.resolve('vault://secret/data/myapp/db_password');
    expect(fetchImpl).toHaveBeenCalledWith('http://cfg:8200/v1/secret/data/myapp', {
      headers: { 'X-Vault-Token': 'cfg-tok' },
    });
  });

  it('a 403 tells the user to check VAULT_TOKEN', async () => {
    process.env.VAULT_ADDR = 'http://v:8200';
    process.env.VAULT_TOKEN = 'bad';
    const provider = new HashiCorpVaultProvider({ loadConfig: async () => ({}), fetchImpl: makeFetch(403, {}) });
    await expect(provider.resolve('vault://secret/data/myapp/db_password')).rejects.toThrow(/403.*check your VAULT_TOKEN/i);
  });

  it('a 404 reports the missing secret path', async () => {
    process.env.VAULT_ADDR = 'http://v:8200';
    process.env.VAULT_TOKEN = 'tok';
    const provider = new HashiCorpVaultProvider({ loadConfig: async () => ({}), fetchImpl: makeFetch(404, {}) });
    await expect(provider.resolve('vault://secret/data/nope/key')).rejects.toThrow(/secret\/data\/nope/);
  });

  it('errors when the field is missing from the secret', async () => {
    process.env.VAULT_ADDR = 'http://v:8200';
    process.env.VAULT_TOKEN = 'tok';
    const provider = new HashiCorpVaultProvider({
      loadConfig: async () => ({}),
      fetchImpl: makeFetch(200, { data: { data: { other: 'x' } } }),
    });
    await expect(provider.resolve('vault://secret/data/myapp/db_password')).rejects.toThrow(/field "db_password".*Available fields: other/i);
  });
});
