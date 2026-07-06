import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'create_workspace',
  description:
    'Create a named Reqly workspace at ~/.reqly/workspaces/<name>/workspace.yaml. A workspace groups multiple repos under stable aliases so cross-repo flows can reference requests from any linked repo. Returns the new workspace config { name, repos: [] }. Link repos with link_workspace_repo, activate with use_workspace.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Workspace name (letters, digits, dots, dashes, underscores), e.g. "checkout-team"',
      },
    },
    required: ['name'],
  },
};

export async function handler(args: { name: string }, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    const workspace = await context.workspaceManager.createWorkspace(args.name);
    return { content: [{ type: 'text', text: JSON.stringify(workspace) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
