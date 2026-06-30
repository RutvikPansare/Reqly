import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'create_request',
  description: "Adds a request to an existing collection. When to use: for each endpoint found while reading route handler source - infer method, URL, headers, and body shape from the handler, TypeScript types, Zod schemas, and validation middleware are the most reliable sources. Preferred pattern: call create_collection first if the collection doesn't exist yet, then one create_request call per endpoint. CRITICAL: Use {{baseUrl}} or {{token}} for environment variables if you detect them in the codebase, rather than hardcoding values like http://localhost:3000. Prefer placing query parameters in the `params` object rather than hardcoding them into the `url`. For multipart/form-data requests set body.type to 'multipart' and provide body.parts. File parts use filePath (relative to the project root - the file must exist at run time). Text parts use value. For complex scripts (multi-line, no JSON escaping headache): write the .js file first with write_file (e.g. '.reqly/collections/auth/scripts/login-post.js'), then reference it via postScriptFile: 'scripts/login-post.js' - the engine reads the file at run time so edits are instant without touching the YAML.",
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
          disabledParams: {
            type: 'array',
            items: { type: 'object', properties: { key: { type: 'string' }, value: { type: 'string' } } },
          },
          disabledHeaders: {
            type: 'array',
            items: { type: 'object', properties: { key: { type: 'string' }, value: { type: 'string' } } },
          },
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
            description: "Optional assertions run automatically after every execution of this request. Each object: { field, operator, value, path? }. IMPORTANT: use 'field' (not 'type') to name what to check. field: 'status' | 'body' | 'latency'. operator: 'eq' | 'neq' | 'contains' | 'lt' | 'gt'. path: dot-notation into JSON body (body only). Examples: { field: 'status', operator: 'eq', value: 200 } | { field: 'body', path: 'user.active', operator: 'eq', value: true } | { field: 'latency', operator: 'lt', value: 1000 }",
            items: {
              type: 'object',
              properties: {
                field: { type: 'string', enum: ['status', 'body', 'latency'] },
                path: { type: 'string', description: "body only: dot-notation path, e.g. 'data.id'" },
                operator: { type: 'string', enum: ['eq', 'neq', 'contains', 'lt', 'gt'] },
                value: { description: 'Expected value (string, number, or boolean)' },
              },
              required: ['field', 'operator', 'value'],
            },
          },
          preScript: { type: 'string', description: 'JavaScript executed before the request fires. Has access to env (read/write) and request (read-only). Wins over preScriptFile if both set.' },
          postScript: { type: 'string', description: 'JavaScript executed after the response is received. Has access to env (read/write), request, and response (read-only). Wins over postScriptFile if both set.' },
          preScriptFile: { type: 'string', description: 'Path to a .js file relative to the collection folder (e.g. "scripts/pre.js"). Engine reads the file at run time - edits are picked up without touching the YAML. Preferred agent pattern for complex scripts: write_file(".reqly/collections/<name>/scripts/pre.js", script) then set preScriptFile: "scripts/pre.js". No ../path-traversal allowed.' },
          postScriptFile: { type: 'string', description: 'Path to a .js file relative to the collection folder (e.g. "scripts/post.js"). Engine reads the file at run time - edits are picked up without touching the YAML. Preferred agent pattern for complex scripts: write_file(".reqly/collections/<name>/scripts/post.js", script) then set postScriptFile: "scripts/post.js". No ../path-traversal allowed.' },
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
