import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'stop_proxy',
  description: 'Stop the auto-capture proxy server',
  inputSchema: {
    type: 'object',
    properties: {}
  }
};

export async function handler(args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    await context.proxyServer.stop();
    return { content: [{ type: 'text', text: 'Proxy stopped successfully' }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
