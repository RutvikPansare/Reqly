import * as fs from 'fs/promises';
import * as path from 'path';
import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';
import { generateGithubActionsWorkflow } from '../../engine/github-actions-export.js';

export const definition: ToolDefinition = {
  name: 'export_flow_ci',
  description: 'Generates a GitHub Actions workflow that installs Reqly and runs a flow in CI, writes it to .github/workflows/<flow>.yml, and returns the file path. When to use: right after a flow is working locally, to wire up CI for it without the developer touching a terminal.',
  inputSchema: {
    type: 'object',
    properties: {
      flow: { type: 'string' },
      format: { type: 'string', enum: ['github-actions'], description: 'CI format to generate. Only "github-actions" is supported.' },
    },
    required: ['flow', 'format'],
  },
};

export async function handler(args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    if (args.format !== 'github-actions') {
      return { content: [{ type: 'text', text: `Unsupported format "${args.format}". Supported formats: github-actions` }], isError: true };
    }

    await context.flowManager.getFlow(args.flow); // throws if the flow doesn't exist

    const projectRoot = path.dirname(context.collectionManager.getBaseDir());
    const workflowsDir = path.join(projectRoot, '.github', 'workflows');
    await fs.mkdir(workflowsDir, { recursive: true });

    const yaml = generateGithubActionsWorkflow(args.flow);
    const relativePath = path.join('.github', 'workflows', `${args.flow}.yml`);
    await fs.writeFile(path.join(projectRoot, relativePath), yaml, 'utf8');

    return { content: [{ type: 'text', text: JSON.stringify({ path: relativePath }) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
