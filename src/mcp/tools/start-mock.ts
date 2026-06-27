import type { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'start_mock',
  description:
    'Starts a mock HTTP server for a collection. Each request in the collection that has at least one saved example gets a route. Use X-Reqly-Example: <name> to select a specific example; otherwise the first example is served. Returns the port and active routes. Prerequisite: requests must have saved examples (use save_example or the UI first).',
  inputSchema: {
    type: 'object',
    properties: {
      collection: { type: 'string', description: 'Name of the collection to mock' },
      port: { type: 'number', description: 'Port to listen on (default 4243)' },
    },
    required: ['collection'],
  },
};

export async function handler(args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    const port = args.port ?? 4243;
    await context.mockServer!.start(args.collection, port);
    const status = context.mockServer!.getStatus();
    return { content: [{ type: 'text', text: JSON.stringify({ port: status.port, routes: status.routes }, null, 2) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
