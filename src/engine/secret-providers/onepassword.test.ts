import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OnePasswordProvider, parseOpUri } from './onepassword.js';

describe('parseOpUri', () => {
  it('parses op://vault/item/field', () => {
    expect(parseOpUri('op://MyVault/Stripe/api_key')).toEqual({ vault: 'MyVault', item: 'Stripe', field: 'api_key' });
  });

  it('accepts a section segment: op://vault/item/section/field', () => {
    expect(parseOpUri('op://V/I/Section/field')).toEqual({ vault: 'V', item: 'I', field: 'Section/field' });
  });

  it('throws on missing segments', () => {
    expect(() => parseOpUri('op://MyVault/Stripe')).toThrow(/op:\/\/vault-name\/item-name\/field-name/);
    expect(() => parseOpUri('op://MyVault')).toThrow(/op:\/\/vault-name\/item-name\/field-name/);
    expect(() => parseOpUri('op://V//field')).toThrow(/op:\/\/vault-name\/item-name\/field-name/);
  });
});

describe('OnePasswordProvider', () => {
  const orig = process.env.OP_SERVICE_ACCOUNT_TOKEN;

  beforeEach(() => { delete process.env.OP_SERVICE_ACCOUNT_TOKEN; });
  afterEach(() => {
    if (orig === undefined) delete process.env.OP_SERVICE_ACCOUNT_TOKEN;
    else process.env.OP_SERVICE_ACCOUNT_TOKEN = orig;
  });

  function makeMock(value = 'sk-live-op') {
    const resolve = vi.fn().mockResolvedValue(value);
    const clientFactory = vi.fn().mockResolvedValue({ secrets: { resolve } });
    return { resolve, clientFactory };
  }

  it('has the op:// prefix', () => {
    const provider = new OnePasswordProvider({ loadConfig: async () => ({}) });
    expect(provider.prefix).toBe('op://');
  });

  it('errors with the documented message when no token is configured', async () => {
    const provider = new OnePasswordProvider({ loadConfig: async () => ({}) });
    await expect(provider.resolve('op://V/I/f')).rejects.toThrow(
      /Set OP_SERVICE_ACCOUNT_TOKEN or configure in Settings -> Secrets/
    );
  });

  it('env var token takes precedence over config token', async () => {
    process.env.OP_SERVICE_ACCOUNT_TOKEN = 'env-token';
    const { clientFactory } = makeMock();
    const provider = new OnePasswordProvider({
      loadConfig: async () => ({ secretProviders: { onepassword: { serviceAccountToken: 'config-token' } } }),
      clientFactory,
    });
    await provider.resolve('op://V/I/f');
    expect(clientFactory).toHaveBeenCalledWith('env-token');
  });

  it('falls back to config token when env var is absent', async () => {
    const { clientFactory } = makeMock();
    const provider = new OnePasswordProvider({
      loadConfig: async () => ({ secretProviders: { onepassword: { serviceAccountToken: 'config-token' } } }),
      clientFactory,
    });
    await provider.resolve('op://V/I/f');
    expect(clientFactory).toHaveBeenCalledWith('config-token');
  });

  it('resolves the full op:// URI through the SDK', async () => {
    process.env.OP_SERVICE_ACCOUNT_TOKEN = 'tok';
    const { resolve, clientFactory } = makeMock('the-secret');
    const provider = new OnePasswordProvider({ loadConfig: async () => ({}), clientFactory });
    await expect(provider.resolve('op://MyVault/Stripe/api_key')).resolves.toBe('the-secret');
    expect(resolve).toHaveBeenCalledWith('op://MyVault/Stripe/api_key');
  });

  it('surfaces SDK errors with the original message', async () => {
    process.env.OP_SERVICE_ACCOUNT_TOKEN = 'tok';
    const resolve = vi.fn().mockRejectedValue(new Error('invalid service account token'));
    const provider = new OnePasswordProvider({
      loadConfig: async () => ({}),
      clientFactory: vi.fn().mockResolvedValue({ secrets: { resolve } }),
    });
    await expect(provider.resolve('op://V/I/f')).rejects.toThrow(/invalid service account token/);
  });
});
