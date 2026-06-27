import { ProxyServer } from '../engine/proxy.js';
import { CollectionManager } from '../engine/collection-manager.js';
import { EnvironmentManager } from '../engine/environment-manager.js';
import { AuthManager } from '../engine/auth-manager.js';
import { execute as executeRequest } from '../engine/http-executor.js';
import { FlowManager } from '../engine/flow-manager.js';
import { FlowRunner } from '../engine/flow-runner.js';
import { DotEnvLoader } from '../engine/dotenv-loader.js';
import * as path from 'path';
import { ParsedArgs } from './cli-parser.js';
import { EngineContext } from '../mcp/tools/types.js';
import { ResponseStore } from '../engine/response-store.js';
import { HistoryStore } from '../engine/history-store.js';
import { StepResult, RowResult, FlowRunResult } from '../types/index.js';

function printStep(r: StepResult) {
  const mark = r.passed ? '✓' : '✗';
  console.log(`  ${mark}  ${r.type.padEnd(11)}  ${r.stepId.padEnd(20)}  ${r.duration}ms`);
  if (!r.passed && r.error) {
    console.log(`        ${r.error}`);
  }
}

function reportPretty(result: FlowRunResult) {
  console.log(`Running flow: ${result.flowName}\n`);

  if (result.dataRows) {
    result.dataRows.forEach((row: RowResult, i: number) => {
      console.log(`Row ${i + 1}: ${JSON.stringify(row.data)}`);
      row.steps.forEach(printStep);
      console.log('');
    });
  } else {
    result.steps.forEach(printStep);
  }

  const allSteps = result.dataRows ? result.dataRows.flatMap((r: RowResult) => r.steps) : result.steps;
  const passed = allSteps.filter((s: StepResult) => s.passed).length;
  const failed = allSteps.length - passed;
  console.log(`\nResults: ${passed} passed, ${failed} failed (${result.duration}ms)`);
}

function reportTap(result: FlowRunResult) {
  const allSteps = result.dataRows ? result.dataRows.flatMap((r: RowResult) => r.steps) : result.steps;
  console.log('TAP version 13');
  console.log(`1..${allSteps.length}`);
  allSteps.forEach((r: StepResult, i: number) => {
    console.log(`${r.passed ? 'ok' : 'not ok'} ${i + 1} - ${r.stepId}`);
    if (!r.passed && r.error) {
      console.log(`  ---`);
      console.log(`  error: ${r.error}`);
      console.log(`  ...`);
    }
  });
}

export async function handleRunFlowCommand(
  parsed: ParsedArgs,
  collectionManager: CollectionManager,
  environmentManager: EnvironmentManager,
  authManager: AuthManager
): Promise<number> {
  const [flowName] = parsed.args;

  if (!flowName) {
    console.error('Error: Flow name is required for "reqly run-flow"');
    return 1;
  }

  let dataRow: Record<string, string> | undefined;
  if (parsed.flags.dataRow) {
    try {
      dataRow = JSON.parse(parsed.flags.dataRow);
    } catch (e: any) {
      console.error(`Error: --data-row must be valid JSON: ${e.message}`);
      return 1;
    }
  }

  try {
    const flowManager = new FlowManager(collectionManager.getBaseDir());
    const flow = await flowManager.getFlow(flowName);

    const dotenvFiles = parsed.flags.envFiles || await authManager.getDotenvFiles();
    // .reqly/ is a subfolder of the project root - .env files live one level up.
    const dotEnvLoader = new DotEnvLoader(path.dirname(collectionManager.getBaseDir()), dotenvFiles);
    await dotEnvLoader.load();
    const dotEnvVars = dotEnvLoader.getVariablesRecord();

    const responseStore = new ResponseStore();
    const historyStore = new HistoryStore();
    const proxyServer = new ProxyServer(collectionManager);
    const { TunnelManager } = await import('../engine/tunnel-manager.js');
    const tunnelManager = new TunnelManager();
    const context: EngineContext = {
      collectionManager,
      environmentManager,
      authManager,
      proxyServer,
      tunnelManager,
      responseStore,
      historyStore,
      flowManager,
      dotEnvLoader,
      executeRequest: (req, env2, auth, truncate, maxBodyBytes, collectionVars, collectionAuth) =>
        executeRequest(req, env2, auth, truncate, maxBodyBytes, collectionVars, collectionAuth, dotEnvVars)
    };

    const runner = new FlowRunner(context);
    const result = await runner.run(flow, dataRow ? { dataRow } : {});

    if (parsed.flags.reporter === 'json') {
      console.log(JSON.stringify(result, null, 2));
    } else if (parsed.flags.reporter === 'tap') {
      reportTap(result);
    } else {
      reportPretty(result);
    }

    return result.passed ? 0 : 1;
  } catch (e: any) {
    console.error(`Error running flow: ${e.message}`);
    return 1;
  }
}
