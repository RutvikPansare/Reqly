import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';
import { listOperations } from '../../engine/contract-validator.js';

export const definition: ToolDefinition = {
  name: 'list_spec_operations',
  description: 'Lists every operation (operationId, method, path, summary) in the OpenAPI/Swagger spec configured on a collection. When to use: to pick the right operationId to set via specOperationId on a request, especially when the request URL does not cleanly map to a spec path (e.g. a custom mockPath or an unusual base URL).',
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
    if (!spec) {
      return { content: [{ type: 'text', text: 'No spec configured on this collection. Use set_collection_spec first.' }], isError: true };
    }
    const source = spec.specPath || spec.specUrl;
    const loaded = await context.specLoader.load(source!);
    return { content: [{ type: 'text', text: JSON.stringify(listOperations(loaded)) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
