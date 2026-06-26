import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'save_example',
  description:
    "Saves a response as a named example against a request in a collection. " +
    "Examples are stored as YAML alongside the request and act as documentation. " +
    "Use after running a request to capture a representative response shape. " +
    "Returns the saved example id and name.",
  inputSchema: {
    type: 'object',
    properties: {
      collectionName: { type: 'string', description: 'Name of the collection' },
      requestName:    { type: 'string', description: 'Name of the request to attach the example to' },
      exampleName:    { type: 'string', description: 'Human-readable label for this example (e.g. "Success 200", "Not Found 404")' },
      status:         { type: 'number', description: 'HTTP status code' },
      body:           { description: 'Response body (any JSON-serialisable value or null)' },
      headers:        { type: 'object', description: 'Response headers as key-value strings' },
      latency:        { type: 'number', description: 'Response latency in milliseconds' },
    },
    required: ['collectionName', 'requestName', 'exampleName', 'status', 'body', 'headers', 'latency'],
  },
};

export async function handler(args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    const { collectionName, requestName, exampleName, status, body, headers, latency } = args;
    const saved = await context.collectionManager.saveExample(collectionName, requestName, {
      name: exampleName,
      status,
      body: body ?? null,
      headers: headers || {},
      latency: latency || 0,
    });
    return {
      content: [{ type: 'text', text: JSON.stringify({ id: saved.id, name: saved.name, savedAt: saved.savedAt }) }],
    };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
