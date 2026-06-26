import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'get_flow',
  description: 'Returns a flow by name, including its full step list and any data rows. Use this to inspect a flow before editing it with add_flow_step/update_flow_step/delete_flow_step.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name of the flow' },
    },
    required: ['name'],
  },
};

export async function handler(args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    const flow = await context.flowManager.getFlow(args.name);
    return { content: [{ type: 'text', text: JSON.stringify(flow) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
