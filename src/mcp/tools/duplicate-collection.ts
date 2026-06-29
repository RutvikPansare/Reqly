import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'duplicate_collection',
  description: 'Deep-copies a collection (all its requests and metadata) under a new name, "Copy of <name>" (or "Copy of <name> (1)", etc. if that name is already taken). When to use: to branch a collection before making experimental changes, or to use one collection as a starting template for another. Returns the new collection.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name of the collection to duplicate' }
    },
    required: ['name']
  }
};

export async function handler(args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    const copy = await context.collectionManager.duplicateCollection(args.name);
    return { content: [{ type: 'text', text: JSON.stringify(copy) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
