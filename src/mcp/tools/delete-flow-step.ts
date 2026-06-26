import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'delete_flow_step',
  description: 'Removes a step from a flow by stepId.',
  inputSchema: {
    type: 'object',
    properties: {
      flowName: { type: 'string' },
      stepId: { type: 'string', description: 'id of the step to remove' },
    },
    required: ['flowName', 'stepId'],
  },
};

export async function handler(args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    await context.flowManager.deleteFlowStep(args.flowName, args.stepId);
    return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
