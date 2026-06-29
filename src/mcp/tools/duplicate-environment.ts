import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'duplicate_environment',
  description: 'Copies an environment (all its variables) under a new name, "Copy of <name>" (or "Copy of <name> (1)", etc. if that name is already taken). When to use: to branch an environment (e.g. clone "staging" before tweaking it into "staging-debug") without touching the original. Returns the new environment.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name of the environment to duplicate' }
    },
    required: ['name']
  }
};

export async function handler(args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    const copy = await context.environmentManager.duplicateEnvironment(args.name);
    return { content: [{ type: 'text', text: JSON.stringify(copy) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
