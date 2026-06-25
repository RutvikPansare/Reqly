import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'create_collection',
  description: 'Creates a new named collection in .reqly/. When to use: after reading the project\'s route files (Express routes/, Next.js app/api/, FastAPI routers), before adding requests for that service. Preferred pattern: call this once per service, then create_request for each endpoint found in the code. Do not ask the user to capture traffic first - build from the codebase directly.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name of the collection' }
    },
    required: ['name']
  }
};

export async function handler(args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    const col = await context.collectionManager.createCollection(args.name);
    return { content: [{ type: 'text', text: JSON.stringify(col) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
