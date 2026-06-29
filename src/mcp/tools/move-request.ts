import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'move_request',
  description: 'Moves a saved request from one collection to another. If a request with the same name already exists in the target collection, the moved request is renamed with a "(1)", "(2)", etc. suffix to avoid overwriting it. When to use: to reorganize requests into the right collection after building them ad-hoc, or to consolidate requests scattered across collections. Returns the final name and target collection.',
  inputSchema: {
    type: 'object',
    properties: {
      collection: { type: 'string', description: 'Name of the collection the request currently lives in' },
      request: { type: 'string', description: 'Name of the request to move' },
      targetCollection: { type: 'string', description: 'Name of the collection to move the request into' }
    },
    required: ['collection', 'request', 'targetCollection']
  }
};

export async function handler(args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    const result = await context.collectionManager.moveRequest(args.collection, args.request, args.targetCollection);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
