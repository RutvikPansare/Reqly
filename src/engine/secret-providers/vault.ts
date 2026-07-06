import { SecretProvider } from './index.js';

// Direct HTTP to the Vault KV v2 API - no SDK dependency. fetchImpl is
// injectable for tests; the real path uses global fetch.
export interface VaultProviderOptions {
  loadConfig: () => Promise<any>;
  fetchImpl?: (url: string, init: { headers: Record<string, string> }) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;
}

// vault://secret/data/myapp/db_password: everything up to the last segment is
// the KV v2 API path (GET /v1/secret/data/myapp), the last segment is the
// field inside the secret's data.
export function parseVaultUri(uri: string): { apiPath: string; field: string } {
  const segments = uri.slice('vault://'.length).split('/').filter(Boolean);
  if (segments.length < 4) {
    throw new Error(`Invalid Vault URI "${uri}". Expected vault://<mount>/data/<path>/<field>, e.g. vault://secret/data/myapp/db_password`);
  }
  const field = segments[segments.length - 1];
  const apiPath = segments.slice(0, -1).join('/');
  return { apiPath, field };
}

// Resolves vault:// URIs against HashiCorp Vault's KV v2 HTTP API using token
// auth. Address/token: VAULT_ADDR + VAULT_TOKEN env vars (standard Vault
// conventions) win over secretProviders.vault.{address,token} in ~/.reqly/config.json.
export class HashiCorpVaultProvider implements SecretProvider {
  readonly prefix = 'vault://';

  constructor(private options: VaultProviderOptions) {}

  async resolve(uri: string): Promise<string> {
    const { apiPath, field } = parseVaultUri(uri);

    const config = await this.options.loadConfig();
    const vaultConfig = config?.secretProviders?.vault;
    const address = process.env.VAULT_ADDR || vaultConfig?.address;
    const token = process.env.VAULT_TOKEN || vaultConfig?.token;
    if (!address || !token) {
      throw new Error('HashiCorp Vault connection missing. Set VAULT_ADDR and VAULT_TOKEN or configure secretProviders.vault.{address,token} in ~/.reqly/config.json');
    }

    const fetchImpl = this.options.fetchImpl ?? (fetch as any);
    const url = `${address.replace(/\/+$/, '')}/v1/${apiPath}`;
    const response = await fetchImpl(url, { headers: { 'X-Vault-Token': token } });

    if (response.status === 403) {
      throw new Error(`Vault returned 403 for ${apiPath} - check your VAULT_TOKEN (expired, or missing read policy for this path)`);
    }
    if (response.status === 404) {
      throw new Error(`Vault has no secret at "${apiPath}" (404). Check the path in the URI: ${uri}`);
    }
    if (!response.ok) {
      throw new Error(`Vault request to ${apiPath} failed with HTTP ${response.status}`);
    }

    const body = await response.json();
    const data = body?.data?.data;
    if (!data || data[field] === undefined) {
      const available = data ? Object.keys(data).join(', ') : 'none';
      throw new Error(`Vault secret "${apiPath}" has no field "${field}". Available fields: ${available}`);
    }
    return String(data[field]);
  }
}
