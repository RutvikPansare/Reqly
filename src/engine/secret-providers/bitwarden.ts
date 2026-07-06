import { SecretProvider } from './index.js';

// Minimal surface of @bitwarden/sdk-napi's BitwardenClient that we depend on.
// Kept as an interface so tests inject a mock and the native SDK is only
// loaded when a bw:// URI is actually resolved.
export interface BitwardenClientLike {
  auth(): { loginAccessToken(token: string): Promise<unknown> };
  secrets(): {
    list(organizationId?: string): Promise<{ data: Array<{ id: string; key: string; organizationId: string }> }>;
    get(id: string): Promise<{ id: string; key: string; value: string; projectId?: string }>;
  };
  projects(): { list(organizationId?: string): Promise<{ data: Array<{ id: string; name: string }> }> };
}

export interface BitwardenProviderOptions {
  loadConfig: () => Promise<any>;
  clientFactory?: () => Promise<BitwardenClientLike>;
}

export function parseBwUri(uri: string): { project: string; secret: string } {
  const path = uri.slice('bw://'.length);
  const slash = path.indexOf('/');
  const project = slash === -1 ? path : path.slice(0, slash);
  const secret = slash === -1 ? '' : path.slice(slash + 1);
  if (!project || !secret) {
    throw new Error(`Invalid Bitwarden URI "${uri}". Expected bw://project-name/secret-name`);
  }
  return { project, secret };
}

async function defaultClientFactory(): Promise<BitwardenClientLike> {
  const sdk: any = await import('@bitwarden/sdk-napi');
  return new sdk.BitwardenClient(undefined, sdk.LogLevel?.Error ?? 3);
}

// Resolves bw://project-name/secret-name against Bitwarden Secrets Manager.
// Auth: machine account access token from BITWARDENSM_ACCESS_TOKEN (Bitwarden's
// own convention) or secretProviders.bitwarden.accessToken in ~/.reqly/config.json.
export class BitwardenSecretsProvider implements SecretProvider {
  readonly prefix = 'bw://';

  constructor(private options: BitwardenProviderOptions) {}

  async resolve(uri: string): Promise<string> {
    const { project, secret } = parseBwUri(uri);

    const config = await this.options.loadConfig();
    const token = process.env.BITWARDENSM_ACCESS_TOKEN || config?.secretProviders?.bitwarden?.accessToken;
    if (!token) {
      throw new Error('Bitwarden Secrets Manager token missing. Set BITWARDENSM_ACCESS_TOKEN or configure secretProviders.bitwarden.accessToken in ~/.reqly/config.json');
    }

    const client = await (this.options.clientFactory ?? defaultClientFactory)();
    await client.auth().loginAccessToken(token);

    const listed = await client.secrets().list();
    const candidates = listed.data.filter(s => s.key === secret);
    if (candidates.length === 0) {
      throw new Error(`No secret named "${secret}" found in Bitwarden Secrets Manager (URI: ${uri})`);
    }

    const orgId = candidates[0]?.organizationId;
    const projects = await client.projects().list(orgId);
    const projectEntry = projects.data.find(p => p.name === project);
    if (!projectEntry) {
      throw new Error(`No Bitwarden project "${project}" found (URI: ${uri}). Available projects: ${projects.data.map(p => p.name).join(', ') || 'none'}`);
    }

    for (const candidate of candidates) {
      const full = await client.secrets().get(candidate.id);
      if (full.projectId === projectEntry.id) {
        return full.value;
      }
    }
    throw new Error(`Secret "${secret}" exists but not in project "${project}" (URI: ${uri})`);
  }
}
