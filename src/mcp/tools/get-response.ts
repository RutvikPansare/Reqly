import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'get_response',
  description: 'Retrieves the last cached response for a named request (truncated if it was large). When to use: right after run_request, to inspect the result without re-firing the request. Call get_response_full instead if you need the untruncated body.',
  inputSchema: {
    type: 'object',
    properties: {
      requestName: { type: 'string' }
    },
    required: ['requestName']
  }
};

export async function handler(args: any, context: EngineContext): Promise<ToolHandlerResult> {
  const res = context.responseStore.get(args.requestName);
  if (!res) {
    return { content: [{ type: 'text', text: `No cached response found for ${args.requestName}` }], isError: true };
  }
  return { content: [{ type: 'text', text: JSON.stringify(res) }] };
}
