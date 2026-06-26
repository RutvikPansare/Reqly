import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'set_collection_variable',
  description: 'Sets a key-value pair on a collection (e.g. baseUrl shared by every request in that collection). Collection variables are always available to requests in the collection regardless of the active environment, and they override environment variables of the same name. When to use: to define a {{baseUrl}} or other constant that belongs to one specific API/collection rather than to a dev/staging/prod environment. Use set_variable instead for values that differ per environment.',
  inputSchema: {
    type: 'object',
    properties: {
      collectionName: { type: 'string' },
      key: { type: 'string' },
      value: { type: 'string' }
    },
    required: ['collectionName', 'key', 'value']
  }
};

export async function handler(args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    await context.collectionManager.setCollectionVariable(args.collectionName, args.key, args.value);
    return { content: [{ type: 'text', text: JSON.stringify({ success: true, collectionName: args.collectionName, key: args.key, value: args.value }) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
