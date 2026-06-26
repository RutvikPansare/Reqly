import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'list_flows',
  description: 'Lists every flow stored in .reqly/flows/, including their steps and data rows. Use this to see what flows already exist before creating a new one.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

export async function handler(_args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    const flows = await context.flowManager.listFlows();
    return { content: [{ type: 'text', text: JSON.stringify(flows) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
