import { ProxyServer } from '../engine/proxy.js';
import { CollectionManager } from '../engine/collection-manager.js';
import { EnvironmentManager } from '../engine/environment-manager.js';
import { AuthManager } from '../engine/auth-manager.js';
import { execute as executeRequest } from '../engine/http-executor.js';
import { runAssertions } from '../engine/assertion-runner.js';
import { CollectionRunner } from '../engine/collection-runner.js';
import { FlowManager } from '../engine/flow-manager.js';
import { DotEnvLoader } from '../engine/dotenv-loader.js';
import { createDefaultSecretRegistry } from '../engine/secret-providers/index.js';
import { SpecLoader } from '../engine/spec-loader.js';
import { ScriptVariableStore } from '../engine/script-variables.js';
import * as path from 'path';
import { ParsedArgs } from './cli-parser.js';
import { EngineContext } from '../mcp/tools/types.js';
import { ResponseStore } from '../engine/response-store.js';
import { HistoryStore } from '../engine/history-store.js';
import { AssertionResult } from '../types/assertion.js';
import { toJUnit, toJUnitFromData } from '../engine/reporters/junit.js';
import { DataRunner } from '../engine/data-runner.js';

export async function handleRunCommand(
  parsed: ParsedArgs,
  collectionManager: CollectionManager,
  environmentManager: EnvironmentManager,
  authManager: AuthManager
): Promise<number> {
  const [collectionName, requestName] = parsed.args;

  if (!collectionName) {
    console.error('Error: Collection name is required for "reqly run"');
    return 1;
  }

  const dotenvFiles = parsed.flags.envFiles || await authManager.getDotenvFiles();
  const secretRegistry = await createDefaultSecretRegistry(() => authManager.loadConfig());
  // .reqly/ is a subfolder of the project root - .env files live one level up.
  const dotEnvLoader = new DotEnvLoader(path.dirname(collectionManager.getBaseDir()), dotenvFiles, secretRegistry);
  await dotEnvLoader.load();
  const dotEnvVars = dotEnvLoader.getVariablesRecord();
  const dotEnvErrors: Record<string, string> = {};
  for (const err of dotEnvLoader.getSecretErrors()) dotEnvErrors[err.key] = err.error;
  const secrets = { registry: secretRegistry, dotEnvErrors };

  // Load environment
  let env = await environmentManager.getActiveEnvironment();
  if (parsed.flags.env) {
    env = await environmentManager.getEnvironment(parsed.flags.env);
    if (!env) {
      console.error(`Error: Environment "${parsed.flags.env}" not found.`);
      return 1;
    }
  }

  if (requestName) {
    // Run single request
    try {
      const req = await collectionManager.getRequest(collectionName, requestName);
      let auth;
      if (req.authProfileId) {
        auth = await authManager.getProfile(req.authProfileId);
      }

      const res = await executeRequest(req, env || undefined, auth, undefined, undefined, undefined, undefined, dotEnvVars, path.dirname(collectionManager.getBaseDir()), undefined, {}, undefined, undefined, secrets);
      let assertionsResult: AssertionResult[] | undefined = undefined;
      let passed = true;

      if (req.assertions && req.assertions.length > 0) {
        assertionsResult = runAssertions(res, req.assertions);
        passed = assertionsResult.every(a => a.passed);
      }

      if (parsed.flags.reporter === 'json') {
        console.log(JSON.stringify({
          collection: collectionName,
          passed: passed ? 1 : 0,
          failed: passed ? 0 : 1,
          results: [{
            name: req.name,
            method: req.method,
            status: res.status,
            latency: res.latency,
            passed: passed,
            error: assertionsResult && !passed ? assertionsResult.find((r: AssertionResult) => !r.passed)?.message : undefined
          }]
        }, null, 2));
      } else if (parsed.flags.reporter === 'tap') {
        console.log('TAP version 13');
        console.log('1..1');
        console.log(`${passed ? 'ok' : 'not ok'} 1 - ${req.name}`);
        if (!passed && assertionsResult) {
          const failedAssert = assertionsResult.find((r: AssertionResult) => !r.passed);
          console.log(`  ---`);
          console.log(`  error: ${failedAssert?.message}`);
          console.log(`  ...`);
        }
      } else if (parsed.flags.reporter === 'junit') {
        console.log(toJUnit({
          collection: collectionName,
          total: 1,
          passed: passed ? 1 : 0,
          failed: passed ? 0 : 1,
          stoppedEarly: false,
          results: [{
            requestName: req.name,
            response: res,
            assertions: assertionsResult || [],
            passed,
            duration: res.latency
          }]
        }));
      } else {
        console.log(`Running request: ${collectionName} > ${requestName}\n`);
        const mark = passed ? '✓' : '✗';
        console.log(`  ${mark}  ${req.method.padEnd(5)}  ${req.name.padEnd(20)}  ${res.status}  ${res.latency}ms`);
        if (!passed && assertionsResult) {
          const failedAssert = assertionsResult.find((r: AssertionResult) => !r.passed);
          console.log(`        ${failedAssert?.message}`);
        }
        console.log(`\nResults: ${passed ? 1 : 0} passed, ${passed ? 0 : 1} failed`);
      }

      return passed ? 0 : 1;
    } catch (e: any) {
      console.error(`Error running request: ${e.message}`);
      return 1;
    }
  } else {
    // Run entire collection
    try {
      const responseStore = new ResponseStore(path.dirname(collectionManager.getBaseDir()));
      const historyStore = new HistoryStore(path.dirname(collectionManager.getBaseDir()));
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
        flowManager: new FlowManager(collectionManager.getBaseDir()),
        dotEnvLoader,
        specLoader: new SpecLoader(),
        scriptVariableStore: new ScriptVariableStore(),
        executeRequest: (req, env2, auth, truncate, maxBodyBytes, collectionVars, collectionAuth) =>
          executeRequest(req, env2, auth, truncate, maxBodyBytes, collectionVars, collectionAuth, dotEnvVars, path.dirname(collectionManager.getBaseDir()), undefined, {}, undefined, undefined, secrets)
      };

      let runs: { rowNumber?: number, data?: any, result: import('../engine/collection-runner.js').CollectionRunResult }[] = [];
      let dataRunResult: any = null;

      if (parsed.flags.data) {
        const dataRunner = new DataRunner(context);
        dataRunResult = await dataRunner.run(collectionName, parsed.flags.data, { environment: env || undefined });
        runs = dataRunResult.runs;
      } else {
        const runner = new CollectionRunner(context);
        runs = [{ result: await runner.run(collectionName, { environment: env || undefined }) }];
      }

      let hasContractViolations = false;
      const allViolations = new Map<string, import('../types/index.js').ContractViolation[]>();

      if (parsed.flags.validateSpec) {
        const spec = await collectionManager.getCollectionSpec(collectionName);
        if (spec) {
          const { checkContract } = await import('../mcp/tools/contract-helper.js');
          for (const run of runs) {
            for (const r of run.result.results) {
              if (!r.response) continue;
              const reqDef = await collectionManager.getRequest(collectionName, r.requestName);
              const contractResult = await checkContract(context, collectionName, reqDef, r.response);
              if (contractResult) {
                const key = run.rowNumber ? `${run.rowNumber}-${r.requestName}` : r.requestName;
                allViolations.set(key, contractResult.violations);
                if (contractResult.violations.length > 0) hasContractViolations = true;
              }
            }
          }
        }
      }

      if (parsed.flags.reporter === 'json') {
        if (parsed.flags.data) {
          const resultsWithViolations = {
            ...dataRunResult,
            runs: dataRunResult.runs.map((run: any) => ({
              ...run,
              result: {
                ...run.result,
                results: run.result.results.map((r: any) => ({
                  ...r,
                  ...(allViolations.has(`${run.rowNumber}-${r.requestName}`) ? { contractViolations: allViolations.get(`${run.rowNumber}-${r.requestName}`) } : {}),
                }))
              }
            }))
          };
          console.log(JSON.stringify(resultsWithViolations, null, 2));
        } else {
          const resultsWithViolations = {
            ...runs[0].result,
            results: runs[0].result.results.map((r: any) => ({
              ...r,
              ...(allViolations.has(r.requestName) ? { contractViolations: allViolations.get(r.requestName) } : {}),
            })),
          };
          console.log(JSON.stringify(resultsWithViolations, null, 2));
        }
      } else if (parsed.flags.reporter === 'tap') {
        console.log('TAP version 13');
        const totalTests = runs.reduce((acc, run) => acc + run.result.results.length, 0);
        console.log(`1..${totalTests}`);
        let testIdx = 1;
        for (const run of runs) {
          for (const r of run.result.results) {
            const key = run.rowNumber ? `${run.rowNumber}-${r.requestName}` : r.requestName;
            const violations = allViolations.get(key) || [];
            const ok = r.passed && violations.length === 0;
            const name = run.rowNumber ? `${r.requestName} (Row ${run.rowNumber})` : r.requestName;
            console.log(`${ok ? 'ok' : 'not ok'} ${testIdx++} - ${name}`);
            if (!r.passed && r.error) {
              console.log(`  ---`);
              console.log(`  error: ${r.error}`);
              console.log(`  ...`);
            }
            for (const v of violations) {
              console.log(`  ---`);
              console.log(`  contract: [${v.severity}] ${v.field}: ${v.message}`);
              console.log(`  ...`);
            }
          }
        }
      } else if (parsed.flags.reporter === 'junit') {
        if (parsed.flags.data) {
          console.log(toJUnitFromData(dataRunResult));
        } else {
          console.log(toJUnit(runs[0].result));
        }
      } else {
        console.log(`Running collection: ${collectionName}\n`);
        for (const run of runs) {
          if (run.rowNumber) {
            console.log(`Row ${run.rowNumber} -----------`);
          }
          for (const r of run.result.results) {
            const mark = r.passed ? '✓' : '✗';
            const method = 'UNK';
            const status = r.response?.status || 0;
            const latency = r.response?.latency || 0;
            console.log(`  ${mark}  ${method.padEnd(5)}  ${r.requestName.padEnd(20)}  ${status}  ${latency}ms`);
            if (!r.passed && r.error) {
              console.log(`        ${r.error}`);
            }
            const key = run.rowNumber ? `${run.rowNumber}-${r.requestName}` : r.requestName;
            const violations = allViolations.get(key) || [];
            for (const v of violations) {
              console.log(`        [contract:${v.severity}] ${v.field}: ${v.message}`);
            }
          }
        }
        
        const totalPassed = runs.reduce((acc, run) => acc + run.result.passed, 0);
        const totalFailed = runs.reduce((acc, run) => acc + run.result.failed, 0);
        console.log(`\nResults: ${totalPassed} passed, ${totalFailed} failed`);
        
        if (parsed.flags.validateSpec) {
          const totalViolations = [...allViolations.values()].reduce((sum, v) => sum + v.length, 0);
          console.log(`Contract violations: ${totalViolations}`);
        }
      }

      const totalFailed = runs.reduce((acc, run) => acc + run.result.failed, 0);
      return (totalFailed === 0 && !hasContractViolations) ? 0 : 1;
    } catch (e: any) {
      console.error(`Error running collection: ${e.message}`);
      return 1;
    }
  }
}
