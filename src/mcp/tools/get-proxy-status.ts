import type { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'get_proxy_status',
  description:
    'Returns the current status of the capture proxy: { running: boolean, port?: number, collectionName?: string }. When to use: before calling start_proxy (to avoid a double-start error) or to check where captured traffic is being saved.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

export async function handler(_args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    const status = context.proxyServer.getStatus();
    return { content: [{ type: 'text', text: JSON.stringify(status) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
