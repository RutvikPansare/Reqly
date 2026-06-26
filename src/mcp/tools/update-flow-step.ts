import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';
import { flowStepSchema } from './flow-step-schema.js';

export const definition: ToolDefinition = {
  name: 'update_flow_step',
  description: 'Replaces an existing step in a flow, matched by stepId. Use this to edit a step in place (e.g. change a run step\'s target request, or a conditional\'s expression) without reordering the flow.',
  inputSchema: {
    type: 'object',
    properties: {
      flowName: { type: 'string' },
      stepId: { type: 'string', description: 'id of the step to replace' },
      step: flowStepSchema,
    },
    required: ['flowName', 'stepId', 'step'],
  },
};

export async function handler(args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    await context.flowManager.updateFlowStep(args.flowName, args.stepId, args.step);
    return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
