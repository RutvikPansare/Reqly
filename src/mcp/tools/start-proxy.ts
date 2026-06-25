import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'start_proxy',
  description: 'Starts the outbound capture proxy server. When to use: to capture HTTP calls your app makes TO external APIs (Stripe, Shopify, third-party services) - not for documenting your own endpoints. This does NOT capture inbound calls to your own routes; for those, read the route files and use create_request instead. Preferred pattern: start_proxy, exercise the app, stop_proxy, then list_collections to see what was captured.',
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
