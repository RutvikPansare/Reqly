import * as fs from 'fs/promises';
import * as path from 'path';
import { CollectionManager } from '../engine/collection-manager.js';
import { FlowManager } from '../engine/flow-manager.js';
import { generateGithubActionsWorkflow } from '../engine/github-actions-export.js';
import { ParsedArgs } from './cli-parser.js';

export async function handleExportFlowCommand(parsed: ParsedArgs, collectionManager: CollectionManager): Promise<number> {
  const [flowName] = parsed.args;
  const format = parsed.flags.format || 'github-actions';

  if (!flowName) {
    console.error('Error: Flow name is required for "reqly export-flow"');
    return 1;
  }

  if (format !== 'github-actions') {
    console.error(`Error: Unsupported format "${format}". Supported formats: github-actions`);
    return 1;
  }

  try {
    const flowManager = new FlowManager(collectionManager.getBaseDir());
    await flowManager.getFlow(flowName); // throws if the flow doesn't exist

    const projectRoot = path.dirname(collectionManager.getBaseDir());
    const workflowsDir = path.join(projectRoot, '.github', 'workflows');
    await fs.mkdir(workflowsDir, { recursive: true });

    const yaml = generateGithubActionsWorkflow(flowName);
    const filePath = path.join(workflowsDir, `${flowName}.yml`);
    await fs.writeFile(filePath, yaml, 'utf8');

    console.log(`Written to .github/workflows/${flowName}.yml`);
    console.log(`Tip: Add a 'Start server' step before 'Run flow' if your flow hits a local API`);
    return 0;
  } catch (e: any) {
    console.error(`Error exporting flow: ${e.message}`);
    return 1;
  }
}
