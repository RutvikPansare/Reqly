import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'delete_collection_spec',
  description: 'Removes the OpenAPI/Swagger spec configuration from a collection. run_request stops returning contractViolations for requests in this collection afterward.',
  inputSchema: {
    type: 'object',
    properties: {
      collection: { type: 'string' },
    },
    required: ['collection'],
  },
};

export async function handler(args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    const spec = await context.collectionManager.getCollectionSpec(args.collection);
    await context.collectionManager.deleteCollectionSpec(args.collection);
    const source = spec?.specPath || spec?.specUrl;
    if (source) context.specLoader.clear(source);
    return { content: [{ type: 'text', text: JSON.stringify({ success: true, collection: args.collection }) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
