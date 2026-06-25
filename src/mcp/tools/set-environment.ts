import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'set_environment',
  description: 'Switches the active environment, so subsequent run_request and run_collection calls resolve {{variables}} from it. When to use: before running requests against a different environment (e.g. switching from "development" to "staging").',
  inputSchema: {
    type: 'object',
    properties: {
      environmentName: { type: 'string' }
    },
    required: ['environmentName']
  }
};

export async function handler(args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    await context.environmentManager.setActiveEnvironment(args.environmentName);
    return { content: [{ type: 'text', text: JSON.stringify({ success: true, active: args.environmentName }) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
