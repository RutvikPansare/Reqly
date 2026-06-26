import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'delete_collection_variable',
  description: 'Removes a single collection-level variable from a named collection. When to use: to clean up a stale or misnamed collection variable. Does not error if the key was already absent.',
  inputSchema: {
    type: 'object',
    properties: {
      collectionName: { type: 'string' },
      key: { type: 'string' }
    },
    required: ['collectionName', 'key']
  }
};

export async function handler(args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    await context.collectionManager.deleteCollectionVariable(args.collectionName, args.key);
    return { content: [{ type: 'text', text: JSON.stringify({ success: true, collectionName: args.collectionName, key: args.key }) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
