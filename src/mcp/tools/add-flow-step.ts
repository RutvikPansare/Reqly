import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';
import { flowStepSchema } from './flow-step-schema.js';

export const definition: ToolDefinition = {
  name: 'add_flow_step',
  description: 'Appends a step to the end of a flow. Step types: run (fire a saved request, optional retry), extract (pull a value from the last response into flow-local scope or the active env), assert (check the last response, reuses the same assertion engine as requests), poll (fire repeatedly until a condition is met), conditional (branch on an expression with goto/skip/abort). Build a flow by calling this once per step in order.',
  inputSchema: {
    type: 'object',
    properties: {
      flowName: { type: 'string' },
      step: flowStepSchema,
    },
    required: ['flowName', 'step'],
  },
};

export async function handler(args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    await context.flowManager.addFlowStep(args.flowName, args.step);
    return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
