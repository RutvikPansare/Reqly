import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'link_workspace_repo',
  description:
    'Link a local repo into a named workspace under a stable alias (e.g. alias "auth" -> /repos/auth-service). Aliases are shared across teammates; each developer links their own local path. Upserts if the alias already exists. Returns the updated workspace config { name, repos: [{ alias, path }], sharedEnv? }.',
  inputSchema: {
    type: 'object',
    properties: {
      workspace: { type: 'string', description: 'Workspace name (see list_workspaces)' },
      alias: { type: 'string', description: 'Stable alias for the repo, e.g. "auth"' },
      path: { type: 'string', description: 'Absolute local path to the repo directory' },
    },
    required: ['workspace', 'alias', 'path'],
  },
};

export async function handler(
  args: { workspace: string; alias: string; path: string },
  context: EngineContext
): Promise<ToolHandlerResult> {
  try {
    const workspace = await context.workspaceManager.linkRepo(args.workspace, args.alias, args.path);
    return { content: [{ type: 'text', text: JSON.stringify(workspace) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
