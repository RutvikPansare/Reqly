import { SecretProvider } from './index.js';

// Minimal surface of @1password/sdk that we depend on. The SDK's
// client.secrets.resolve() accepts the full op:// URI directly.
export interface OnePasswordClientLike {
  secrets: { resolve(uri: string): Promise<string> };
}

export interface OnePasswordProviderOptions {
  loadConfig: () => Promise<any>;
  clientFactory?: (token: string) => Promise<OnePasswordClientLike>;
}

// op://vault-name/item-name/field-name, optionally with a section segment
// (op://vault/item/section/field) - exactly 1Password's own reference format.
export function parseOpUri(uri: string): { vault: string; item: string; field: string } {
  const parts = uri.slice('op://'.length).split('/');
  const [vault, item, ...fieldParts] = parts;
  const field = fieldParts.join('/');
  if (!vault || !item || !field || fieldParts.some(p => !p)) {
    throw new Error(`Invalid 1Password URI "${uri}". Expected op://vault-name/item-name/field-name`);
  }
  return { vault, item, field };
}

async function defaultClientFactory(token: string): Promise<OnePasswordClientLike> {
  const sdk: any = await import('@1password/sdk');
  return sdk.createClient({
    auth: token,
    integrationName: 'Reqly',
    integrationVersion: '1.0.0',
  });
}

// Resolves op:// URIs against 1Password via a service account token from
// OP_SERVICE_ACCOUNT_TOKEN (1Password's own convention) or
// secretProviders.onepassword.serviceAccountToken in ~/.reqly/config.json.
export class OnePasswordProvider implements SecretProvider {
  readonly prefix = 'op://';

  constructor(private options: OnePasswordProviderOptions) {}

  async resolve(uri: string): Promise<string> {
    parseOpUri(uri); // validate shape before hitting the SDK for clearer errors

    const config = await this.options.loadConfig();
    const token = process.env.OP_SERVICE_ACCOUNT_TOKEN || config?.secretProviders?.onepassword?.serviceAccountToken;
    if (!token) {
      throw new Error('1Password service account token missing. Set OP_SERVICE_ACCOUNT_TOKEN or configure in Settings -> Secrets (secretProviders.onepassword.serviceAccountToken in ~/.reqly/config.json)');
    }

    const client = await (this.options.clientFactory ?? defaultClientFactory)(token);
    return client.secrets.resolve(uri);
  }
}
