import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'delete_flow',
  description: 'Permanently deletes a flow and all of its steps.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name of the flow to delete' },
    },
    required: ['name'],
  },
};

export async function handler(args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    await context.flowManager.deleteFlow(args.name);
    return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
