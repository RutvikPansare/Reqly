import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';
import { FlowRunner } from '../../engine/flow-runner.js';

export const definition: ToolDefinition = {
  name: 'run_flow',
  description: 'Runs a flow end to end and returns a structured FlowRunResult ({ flowName, passed, steps, dataRows?, duration }). When to use: after building a flow with add_flow_step, to verify the whole multi-step scenario actually works. Pass dataRow to run a single ad-hoc row instead of iterating the flow\'s saved data table.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name of the flow to run' },
      dataRow: {
        type: 'object',
        description: 'Optional. A single data row override for an ad-hoc run - runs once with these values instead of iterating flow.data.',
        additionalProperties: { type: 'string' },
      },
    },
    required: ['name'],
  },
};

export async function handler(args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    const flow = await context.flowManager.getFlow(args.name);
    const runner = new FlowRunner(context);
    const result = await runner.run(flow, args.dataRow ? { dataRow: args.dataRow } : {});
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
