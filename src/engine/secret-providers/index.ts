// Secret provider infrastructure (T-245 core, shipped with T-249).
// Vault URIs in .env values (op://, vault://, aws://, bw://) are resolved
// through this registry instead of being treated as plain strings. Providers
// are registered per integration; a known prefix with no registered provider
// must fail loudly - never silently inject an empty string.

export interface SecretProvider {
  prefix: string;
  resolve(uri: string): Promise<string>;
}

export const KNOWN_SECRET_PREFIXES = ['op://', 'vault://', 'aws://', 'bw://'];

const PROVIDER_NAMES: Record<string, string> = {
  'op://': '1Password',
  'vault://': 'HashiCorp Vault',
  'aws://': 'AWS Secrets Manager',
  'bw://': 'Bitwarden Secrets Manager',
};

export class SecretProviderRegistry {
  private providers: Map<string, SecretProvider> = new Map();

  register(provider: SecretProvider): void {
    this.providers.set(provider.prefix, provider);
  }

  // True when the value starts with any known vault prefix, whether or not a
  // provider is registered for it - callers use this to detect misconfiguration.
  isSecretUri(value: string): boolean {
    return KNOWN_SECRET_PREFIXES.some(prefix => value.startsWith(prefix));
  }

  async resolve(uri: string): Promise<string> {
    const prefix = KNOWN_SECRET_PREFIXES.find(p => uri.startsWith(p));
    if (!prefix) {
      throw new Error(`"${uri}" is not a known secret URI. Supported prefixes: ${KNOWN_SECRET_PREFIXES.join(', ')}`);
    }
    const provider = this.providers.get(prefix);
    if (!provider) {
      throw new Error(`The ${PROVIDER_NAMES[prefix]} (${prefix}) secret provider is not configured. Configure it before using ${prefix} URIs.`);
    }
    return provider.resolve(uri);
  }
}

// Builds the registry with every shipped provider. Integration tasks
// (T-246 1Password, T-247 AWS, T-248 Vault) add their registration here so
// all entry points (server, CLI runs) get the same provider set.
export async function createDefaultSecretRegistry(loadConfig: () => Promise<any>): Promise<SecretProviderRegistry> {
  const registry = new SecretProviderRegistry();
  const { BitwardenSecretsProvider } = await import('./bitwarden.js');
  registry.register(new BitwardenSecretsProvider({ loadConfig }));
  const { OnePasswordProvider } = await import('./onepassword.js');
  registry.register(new OnePasswordProvider({ loadConfig }));
  const { AwsSecretsProvider } = await import('./aws.js');
  registry.register(new AwsSecretsProvider({ loadConfig }));
  return registry;
}
