import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';
import { listOperations } from '../../engine/contract-validator.js';

export const definition: ToolDefinition = {
  name: 'set_collection_spec',
  description: 'Configures an OpenAPI/Swagger spec on a collection for contract validation - persists the config and loads the spec immediately. After this, run_request automatically returns contractViolations for any request matched to a spec operation. When to use: right after building a collection from a known OpenAPI spec, so every subsequent run_request call validates the response shape for free.',
  inputSchema: {
    type: 'object',
    properties: {
      collection: { type: 'string' },
      specPath: { type: 'string', description: 'Local file path to the spec (relative to the project root)' },
      specUrl: { type: 'string', description: 'Remote URL to the spec' },
    },
    required: ['collection'],
  },
};

export async function handler(args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    const spec = { ...(args.specPath ? { specPath: args.specPath } : {}), ...(args.specUrl ? { specUrl: args.specUrl } : {}) };
    await context.collectionManager.setCollectionSpec(args.collection, spec);

    const source = args.specPath || args.specUrl;
    const loaded = await context.specLoader.load(source);
    const operationCount = listOperations(loaded).length;

    return { content: [{ type: 'text', text: JSON.stringify({ collection: args.collection, ...spec, operationCount }) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
