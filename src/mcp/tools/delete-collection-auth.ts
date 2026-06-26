import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'delete_collection_auth',
  description: 'Removes the collection-level auth configuration from a named collection. After deletion, requests in the collection will not have any auth injected unless they have their own request-level auth configured. Does not error if no collection auth was set. When to use: to clear a shared auth config that is no longer needed.',
  inputSchema: {
    type: 'object',
    properties: {
      collectionName: { type: 'string' },
    },
    required: ['collectionName'],
  },
};

export async function handler(args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    await context.collectionManager.deleteCollectionAuth(args.collectionName);
    return {
      content: [{ type: 'text', text: JSON.stringify({ success: true, collectionName: args.collectionName }) }],
    };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
