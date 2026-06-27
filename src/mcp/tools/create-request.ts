import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'create_request',
  description: "Adds a request to an existing collection. When to use: for each endpoint found while reading route handler source - infer method, URL, headers, and body shape from the handler, TypeScript types, Zod schemas, and validation middleware are the most reliable sources. Preferred pattern: call create_collection first if the collection doesn't exist yet, then one create_request call per endpoint. Use {{variableName}} for any value that varies by environment (baseUrl, tokens) rather than hardcoding it. For multipart/form-data requests set body.type to 'multipart' and provide body.parts. File parts use filePath (relative to the project root - the file must exist at run time). Text parts use value.",
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
          body: {
            oneOf: [
              { type: 'string', description: 'Raw body string (use for raw/plain-text bodies)' },
              {
                type: 'object',
                description: 'JSON object body - serialised as application/json automatically',
              },
              {
                type: 'object',
                description: "Multipart body. Set type to 'multipart' and provide parts. Text parts: { type: 'text', name, value }. File parts: { type: 'file', name, filePath, contentType? } where filePath is relative to the project root and the file must exist at run time.",
                properties: {
                  type: { type: 'string', enum: ['multipart'] },
                  parts: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        type: { type: 'string', enum: ['text', 'file'] },
                        value: { type: 'string', description: 'Used for text parts' },
                        filePath: { type: 'string', description: 'Path relative to project root, used for file parts' },
                        contentType: { type: 'string', description: 'MIME type override for file parts (e.g. image/jpeg). Auto-detected if omitted.' },
                      },
                      required: ['name', 'type'],
                    },
                  },
                },
                required: ['type', 'parts'],
              },
            ],
          },
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
          postScript: { type: 'string', description: 'JavaScript executed after the response is received. Has access to env (read/write), request, and response (read-only).' },
          specOperationId: { type: 'string', description: 'OpenAPI operationId for contract validation, used when the collection has a spec configured (set_collection_spec) and the request URL does not cleanly map to a spec path. Get valid values from list_spec_operations.' }
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
