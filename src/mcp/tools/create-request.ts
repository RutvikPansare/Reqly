import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'create_request',
  description: "Adds a request to an existing collection. When to use: for each endpoint found while reading route handler source - infer method, URL, headers, and body shape from the handler, TypeScript types, Zod schemas, and validation middleware are the most reliable sources. Preferred pattern: call create_collection first if the collection doesn't exist yet, then one create_request call per endpoint. Use {{variableName}} for any value that varies by environment (baseUrl, tokens) rather than hardcoding it.",
  inputSchema: {
    type: 'object',
    properties: {
      collectionName: { type: 'string' },
      request: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          method: { type: 'string' },
          url: { type: 'string' },
          headers: { type: 'object' },
          body: { type: 'string' },
          params: { type: 'object' },
          authProfileId: { type: 'string' },
          environmentId: { type: 'string' },
          type: { type: 'string', enum: ['rest', 'graphql'] },
          graphql: {
            type: 'object',
            properties: {
              query: { type: 'string' },
              variables: { type: 'object' }
            },
            required: ['query']
          },
          preScript: { type: 'string', description: 'JavaScript executed before the request fires. Has access to env (read/write) and request (read-only).' },
          postScript: { type: 'string', description: 'JavaScript executed after the response is received. Has access to env (read/write), request, and response (read-only).' }
        },
        required: ['id', 'name', 'method', 'url']
      }
    },
    required: ['collectionName', 'request']
  }
};

export async function handler(args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    await context.collectionManager.addRequest(args.collectionName, args.request);
    return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
