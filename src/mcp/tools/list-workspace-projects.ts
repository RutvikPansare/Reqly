import * as path from 'path';
import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'list_workspace_projects',
  description: 'List all projects configured in the Reqly workspace. Returns the active project and any additional projects stored in ~/.reqly/config.json.',
  inputSchema: {
    type: 'object',
    properties: {}
  }
};

export async function handler(_args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    const activeProjectRoot = path.dirname(context.collectionManager.getBaseDir());
    const configuredProjects = await context.authManager.getWorkspaceProjects();
    const projectsSet = new Set([activeProjectRoot, ...configuredProjects]);
    const projects = Array.from(projectsSet).map(p => ({
      path: p,
      name: path.basename(p),
      active: p === activeProjectRoot,
    }));
    return { content: [{ type: 'text', text: JSON.stringify({ projects }) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
