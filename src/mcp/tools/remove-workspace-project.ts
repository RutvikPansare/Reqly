import { ToolDefinition } from './types.js';
import { EngineContext } from '../../engine/context.js';

export const definition: ToolDefinition = {
  name: 'remove_workspace_project',
  description: 'Remove a project directory from the Reqly workspace',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Absolute path to the project directory to remove' }
    },
    required: ['path']
  }
};

export const handler = async (args: { path: string }, context: EngineContext) => {
  await context.authManager.removeWorkspaceProject(args.path);
  return {
    content: [{ type: 'text', text: `Removed project from workspace: ${args.path}` }]
  };
};
