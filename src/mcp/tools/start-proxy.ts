import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'start_proxy',
  description: 'Start the auto-capture proxy server',
  inputSchema: {
    type: 'object',
    properties: {
      port: { type: 'number', description: 'Port to listen on (default 7474)' },
      collectionName: { type: 'string', description: 'Collection to save requests to (default "captured")' }
    }
  }
};

export async function handler(args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    await context.proxyServer.start({
      port: args.port || 7474,
      collectionName: args.collectionName || 'captured'
    });
    return { content: [{ type: 'text', text: 'Proxy started successfully' }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
