import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'list_collections',
  description: 'Returns all collections and requests in the active project. When to use: call this first on any new session, before creating anything, to see what already exists and avoid duplicating collections or requests.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: []
  }
};

export async function handler(args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    const cols = await context.collectionManager.listCollections();
    return { content: [{ type: 'text', text: JSON.stringify(cols) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
