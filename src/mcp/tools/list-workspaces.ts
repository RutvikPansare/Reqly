import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'list_workspaces',
  description:
    'List all named Reqly workspaces from ~/.reqly/workspaces/ and which one is active. Returns { workspaces: [{ name, repos: [{ alias, path }], sharedEnv? }], active: <name> | null }. Distinct from list_workspace_projects, which lists the flat multi-project path list.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

export async function handler(_args: Record<string, never>, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    const workspaces = await context.workspaceManager.listWorkspaces();
    const active = await context.workspaceManager.getActiveWorkspace();
    return {
      content: [
        { type: 'text', text: JSON.stringify({ workspaces, active: active?.name ?? null }) },
      ],
    };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
