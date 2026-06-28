import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'create_collection',
  description: 'Creates a new named collection in .reqly/. When to use: after reading the project\'s route files (Express routes/, Next.js app/api/, FastAPI routers), before adding requests for that service. Preferred pattern: call this once per service, and supply the `requests` array to scaffold all endpoints found in the code in a single bulk operation.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name of the collection' },
      requests: {
        type: 'array',
        description: 'Optional array of requests to create inside this collection immediately.',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            method: { type: 'string' },
            url: { type: 'string' },
            headers: { type: 'object' },
            body: {
              oneOf: [
                { type: 'string', description: 'Raw body string' },
                { type: 'object', description: 'JSON object body' },
                {
                  type: 'object',
                  properties: {
                    type: { type: 'string', enum: ['multipart'] },
                    parts: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          name: { type: 'string' },
                          type: { type: 'string', enum: ['text', 'file'] },
                          value: { type: 'string' },
                          filePath: { type: 'string' },
                          contentType: { type: 'string' },
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
            disabledParams: { type: 'array', items: { type: 'object', properties: { key: { type: 'string' }, value: { type: 'string' } } } },
            disabledHeaders: { type: 'array', items: { type: 'object', properties: { key: { type: 'string' }, value: { type: 'string' } } } },
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
            assertions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string', enum: ['status', 'body', 'latency'] },
                  path: { type: 'string' },
                  operator: { type: 'string', enum: ['eq', 'neq', 'contains', 'lt', 'gt'] },
                  value: {}
                },
                required: ['field', 'operator', 'value'],
              },
            },
            preScript: { type: 'string' },
            postScript: { type: 'string' },
            specOperationId: { type: 'string' }
          },
          required: ['id', 'name', 'method', 'url']
        }
      }
    },
    required: ['name']
  }
};

export async function handler(args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    const col = await context.collectionManager.createCollection(args.name);
    
    if (args.requests && Array.isArray(args.requests)) {
      for (const req of args.requests) {
        await context.collectionManager.addRequest(args.name, req);
      }
    }
    
    return { content: [{ type: 'text', text: JSON.stringify(col) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
