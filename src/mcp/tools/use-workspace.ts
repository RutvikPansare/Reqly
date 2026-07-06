import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'use_workspace',
  description:
    'Set the active Reqly workspace (persisted in ~/.reqly/config.json as activeWorkspace). The active workspace provides alias -> path resolution for cross-repo flows. Returns { active: <name>, workspace: { name, repos, sharedEnv? } }.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Workspace name to activate (see list_workspaces)' },
    },
    required: ['name'],
  },
};

export async function handler(args: { name: string }, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    const workspace = await context.workspaceManager.useWorkspace(args.name);
    return {
      content: [{ type: 'text', text: JSON.stringify({ active: args.name, workspace }) }],
    };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
