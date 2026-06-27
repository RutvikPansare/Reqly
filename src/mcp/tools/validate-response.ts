import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';
import { checkContract } from './contract-helper.js';

export const definition: ToolDefinition = {
  name: 'validate_response',
  description: 'Re-validates the last stored response for a request against the collection\'s configured OpenAPI spec, without re-running the request. When to use: to check contract violations on a response you already have, or after configuring a spec on a collection whose requests were run before the spec existed.',
  inputSchema: {
    type: 'object',
    properties: {
      collection: { type: 'string' },
      request: { type: 'string' },
    },
    required: ['collection', 'request'],
  },
};

export async function handler(args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    const spec = await context.collectionManager.getCollectionSpec(args.collection);
    if (!spec) {
      return { content: [{ type: 'text', text: 'No spec configured on this collection. Use set_collection_spec first.' }], isError: true };
    }

    const response = context.responseStore.get(args.request);
    if (!response) {
      return { content: [{ type: 'text', text: `No stored response for "${args.request}". Run it with run_request first.` }], isError: true };
    }

    const req = await context.collectionManager.getRequest(args.collection, args.request);
    const result = await checkContract(context, args.collection, req, response);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ violations: result?.violations || [], operation: result?.operationId, matched: result?.matched ?? false }),
      }],
    };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
