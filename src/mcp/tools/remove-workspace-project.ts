import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'remove_workspace_project',
  description: 'Remove a project directory from the Reqly workspace. Does not delete any files; only removes the path from the workspace config.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Absolute path to the project directory to remove' }
    },
    required: ['path']
  }
};

export async function handler(args: { path: string }, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    await context.authManager.removeWorkspaceProject(args.path);
    return { content: [{ type: 'text', text: JSON.stringify({ ok: true, path: args.path }) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
