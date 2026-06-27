import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';
import { listOperations } from '../../engine/contract-validator.js';

export const definition: ToolDefinition = {
  name: 'get_collection_spec',
  description: 'Returns the OpenAPI/Swagger spec configuration for a collection, including whether it is currently loaded and how many operations it defines. When to use: to check whether contract validation is set up before debugging why run_request is not returning contractViolations.',
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
      return { content: [{ type: 'text', text: JSON.stringify({ loaded: false, operationCount: 0 }) }] };
    }

    const source = spec.specPath || spec.specUrl;
    const cached = source ? context.specLoader.get(source) : undefined;
    const operationCount = cached ? listOperations(cached).length : 0;

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ specPath: spec.specPath, specUrl: spec.specUrl, operationCount, loaded: !!cached }),
      }],
    };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
