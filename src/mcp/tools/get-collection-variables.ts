import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'get_collection_variables',
  description: 'Lists the collection-level variables for a named collection. Collection variables are always available to every request in that collection, regardless of the active environment, and they win over environment variables of the same name. When to use: to check what {{baseUrl}}/tokens a collection already defines before calling set_collection_variable, or to debug why a {{variable}} resolves to an unexpected value.',
  inputSchema: {
    type: 'object',
    properties: {
      collectionName: { type: 'string' }
    },
    required: ['collectionName']
  }
};

export async function handler(args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    const vars = await context.collectionManager.getCollectionVariables(args.collectionName);
    const list = Object.entries(vars).map(([key, value]) => ({ key, value }));
    return { content: [{ type: 'text', text: JSON.stringify(list) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
