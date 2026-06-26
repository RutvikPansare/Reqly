import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'list_examples',
  description:
    "Lists all saved example responses for a request in a collection. " +
    "Returns each example's id, name, status code, latency, body, headers, and savedAt timestamp. " +
    "Use to inspect what documented shapes exist before adding a new one, or to retrieve example bodies for verification.",
  inputSchema: {
    type: 'object',
    properties: {
      collectionName: { type: 'string', description: 'Name of the collection' },
      requestName:    { type: 'string', description: 'Name of the request' },
    },
    required: ['collectionName', 'requestName'],
  },
};

export async function handler(args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    const { collectionName, requestName } = args as { collectionName: string; requestName: string };
    const examples = await context.collectionManager.listExamples(collectionName, requestName);
    return {
      content: [{ type: 'text', text: JSON.stringify({ count: examples.length, examples }) }],
    };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
