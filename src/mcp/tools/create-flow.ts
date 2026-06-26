import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'create_flow',
  description: 'Creates a new named flow in .reqly/flows/. A flow is an ordered sequence of steps that orchestrates saved requests into an end-to-end automation test (run/extract/assert/poll/conditional), distinct from a collection which just holds saved requests. When to use: after the requests it needs already exist in a collection, to wire them into a multi-step test (e.g. login then use the token then assert a field).',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name of the flow' },
      description: { type: 'string', description: 'Optional human-readable description of what the flow tests' },
    },
    required: ['name'],
  },
};

export async function handler(args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    const flow = await context.flowManager.createFlow(args.name, args.description);
    return { content: [{ type: 'text', text: JSON.stringify(flow) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
