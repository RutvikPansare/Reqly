import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'get_secret',
  description: 'Resolves a vault secret URI (bw://project/secret; op://, vault://, aws:// once those providers ship) and returns { resolved: true, preview } where preview is only the first 4 characters of the value followed by "..." - the full secret value is never returned. When to use: to verify a secret referenced in .env is reachable and the provider is configured before running a collection. Errors explain which provider is missing or how to configure its token.',
  inputSchema: {
    type: 'object',
    properties: {
      uri: { type: 'string', description: 'Vault secret URI, e.g. bw://my-project/stripe-key' },
    },
    required: ['uri'],
  },
};

export async function handler(args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    if (!context.secretRegistry) {
      throw new Error('Secret provider registry is not available in this server instance.');
    }
    const value = await context.secretRegistry.resolve(args.uri);
    // Only ever expose a short preview - tool output ends up in agent transcripts.
    const preview = value.slice(0, 4) + '...';
    return { content: [{ type: 'text', text: JSON.stringify({ resolved: true, preview }) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
