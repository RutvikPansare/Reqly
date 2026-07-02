import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'add_workspace_project',
  description: 'Add a project directory to the Reqly workspace. Use list_workspace_projects to see existing projects. The directory must contain a .reqly/ folder.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Absolute path to the project directory' }
    },
    required: ['path']
  }
};

export async function handler(args: { path: string }, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    await context.authManager.addWorkspaceProject(args.path);
    return { content: [{ type: 'text', text: JSON.stringify({ ok: true, path: args.path }) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
