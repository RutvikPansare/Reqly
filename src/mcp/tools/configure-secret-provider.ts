import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

// Provider names accepted today. Integration tasks extend this list as their
// providers ship (1password: T-246, aws: T-247, vault: T-248).
export const KNOWN_PROVIDER_NAMES = ['bitwarden', 'onepassword', 'aws', 'vault'];

export const definition: ToolDefinition = {
  name: 'configure_secret_provider',
  description: 'Stores secret provider credentials in ~/.reqly/config.json under secretProviders.<provider> (global config, never the project repo), then re-resolves the project\'s .env vault URIs. provider: "bitwarden" (config keys: accessToken, organizationId), "onepassword" (config key: serviceAccountToken), "aws" (config key: region only - credentials always come from the standard AWS chain), or "vault" (config keys: address, token; VAULT_ADDR + VAULT_TOKEN env vars win). config: an object of provider-specific keys, merged with any existing config for that provider. Returns { provider, configured: true, secrets } where secrets is the refreshed get_secret_status list. Config values are never echoed back. When to use: during project setup when get_secret_status shows "provider not configured" errors.',
  inputSchema: {
    type: 'object',
    properties: {
      provider: { type: 'string', description: 'Provider name: bitwarden | onepassword | aws | vault' },
      config: { type: 'object', description: 'Provider-specific config keys, e.g. { accessToken, organizationId } for bitwarden' },
    },
    required: ['provider', 'config'],
  },
};

export async function handler(args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    if (!KNOWN_PROVIDER_NAMES.includes(args.provider)) {
      throw new Error(`Unknown provider "${args.provider}". Supported: ${KNOWN_PROVIDER_NAMES.join(', ')}`);
    }
    await context.authManager.setSecretProviderConfig(args.provider, args.config);
    // Re-resolve .env vault URIs with the new credentials.
    await context.dotEnvLoader.load();
    const secrets = typeof (context.dotEnvLoader as any).getSecretStatus === 'function'
      ? context.dotEnvLoader.getSecretStatus()
      : [];
    return { content: [{ type: 'text', text: JSON.stringify({ provider: args.provider, configured: true, secrets }) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
