import { ToolDefinition } from './types.js';
import { EngineContext } from '../../engine/context.js';

export const definition: ToolDefinition = {
  name: 'add_workspace_project',
  description: 'Add a project directory to the Reqly workspace. The directory must contain a .reqly/ folder.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Absolute path to the project directory' }
    },
    required: ['path']
  }
};

export const handler = async (args: { path: string }, context: EngineContext) => {
  await context.authManager.addWorkspaceProject(args.path);
  return {
    content: [{ type: 'text', text: `Added project to workspace: ${args.path}` }]
  };
};
