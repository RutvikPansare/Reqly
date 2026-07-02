import { ToolDefinition } from './types.js';
import { EngineContext } from '../../engine/context.js';
import * as path from 'path';

export const definition: ToolDefinition = {
  name: 'list_workspace_projects',
  description: 'List all projects configured in the Reqly workspace',
  inputSchema: {
    type: 'object',
    properties: {}
  }
};

export const handler = async (_args: any, context: EngineContext) => {
  const activeProjectRoot = path.dirname(context.collectionManager.getBaseDir());
  const configuredProjects = await context.authManager.getWorkspaceProjects();
  const projectsSet = new Set([activeProjectRoot, ...configuredProjects]);
  const projects = Array.from(projectsSet).map(p => ({
    path: p,
    name: path.basename(p),
  }));

  return {
    content: [{ type: 'text', text: JSON.stringify({ projects }, null, 2) }]
  };
};
