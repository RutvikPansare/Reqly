import { describe, it, expect } from 'vitest';
import { SecretProviderRegistry, KNOWN_SECRET_PREFIXES } from './index.js';

describe('SecretProviderRegistry', () => {
  it('knows the four planned vault URI prefixes', () => {
    expect(KNOWN_SECRET_PREFIXES).toEqual(['op://', 'vault://', 'aws://', 'bw://']);
  });

  it('isSecretUri returns false for plain values', () => {
    const registry = new SecretProviderRegistry();
    expect(registry.isSecretUri('https://api.example.com')).toBe(false);
    expect(registry.isSecretUri('sk-test-1234')).toBe(false);
    expect(registry.isSecretUri('')).toBe(false);
  });

  it('isSecretUri returns true for any known vault prefix, registered or not', () => {
    const registry = new SecretProviderRegistry();
    expect(registry.isSecretUri('bw://myproject/api-key')).toBe(true);
    expect(registry.isSecretUri('op://vault/item/field')).toBe(true);
    expect(registry.isSecretUri('vault://secret/data/x')).toBe(true);
    expect(registry.isSecretUri('aws://my-secret')).toBe(true);
  });

  it('routes resolve() to the provider registered for the prefix', async () => {
    const registry = new SecretProviderRegistry();
    registry.register({ prefix: 'bw://', resolve: async (uri) => `resolved:${uri}` });
    await expect(registry.resolve('bw://proj/name')).resolves.toBe('resolved:bw://proj/name');
  });

  it('throws a clear error for a known prefix with no registered provider', async () => {
    const registry = new SecretProviderRegistry();
    await expect(registry.resolve('op://vault/item/field')).rejects.toThrow(
      /op:\/\/.*provider.*not configured/i
    );
  });

  it('throws for a URI that matches no known prefix', async () => {
    const registry = new SecretProviderRegistry();
    await expect(registry.resolve('foo://bar')).rejects.toThrow(/not a known secret URI/i);
  });
});
