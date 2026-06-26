import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'get_collection_auth',
  description: 'Returns the collection-level auth configuration for a named collection. Collection auth is applied to every request in the collection unless a request has its own auth configured (or explicitly sets type:none to opt out). When to use: before calling set_collection_auth to check what is already set, or to debug why requests are getting unexpected auth headers. Returns null when no collection auth is configured.',
  inputSchema: {
    type: 'object',
    properties: {
      collectionName: { type: 'string' },
    },
    required: ['collectionName'],
  },
};

export async function handler(args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    const auth = await context.collectionManager.getCollectionAuth(args.collectionName);
    return { content: [{ type: 'text', text: JSON.stringify(auth ?? null) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
