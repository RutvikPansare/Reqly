import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'stop_proxy',
  description: 'Stops the auto-capture proxy server and kills any process spawned by exec_with_proxy. When to use: after capturing the traffic you needed, before list_collections to review what got captured.',
  inputSchema: {
    type: 'object',
    properties: {}
  }
};

export async function handler(args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    await context.proxyServer.stop();

    if (context.execChildPid) {
      try {
        process.kill(-context.execChildPid);
      } catch {
        try {
          process.kill(context.execChildPid);
        } catch {
          // process already gone
        }
      }
      context.execChildPid = undefined;
    }

    return { content: [{ type: 'text', text: 'Proxy stopped successfully' }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
