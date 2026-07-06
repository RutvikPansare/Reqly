import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'get_secret_status',
  description: 'Lists every vault secret URI detected in the project\'s .env files with its resolution status. Returns { secrets: [{ key, uri, source, status: "resolved" | "error", error? }] } - values are never included. When to use: before running a collection that depends on .env vault secrets, to check all of them resolve; or to diagnose which provider still needs configuring (then call configure_secret_provider or get_secret).',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

export async function handler(_args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    if (typeof (context.dotEnvLoader as any)?.getSecretStatus !== 'function') {
      throw new Error('Secret status is not available in this server instance.');
    }
    const secrets = context.dotEnvLoader.getSecretStatus();
    return { content: [{ type: 'text', text: JSON.stringify({ secrets }) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
