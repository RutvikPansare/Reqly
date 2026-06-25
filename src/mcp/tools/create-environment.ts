import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'create_environment',
  description: 'Creates a new named environment (e.g. "development", "staging") for holding variables like baseUrl and auth tokens. When to use: at the start of building a collection, before set_variable. Preferred pattern: create_environment, then set_variable for baseUrl and tokens, then create_collection and create_request.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string' }
    },
    required: ['name']
  }
};

export async function handler(args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    const env = await context.environmentManager.createEnvironment(args.name, {});
    return { content: [{ type: 'text', text: JSON.stringify(env) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
