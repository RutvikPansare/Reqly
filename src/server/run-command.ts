import { ProxyServer } from '../engine/proxy.js';
import { CollectionManager } from '../engine/collection-manager.js';
import { EnvironmentManager } from '../engine/environment-manager.js';
import { AuthManager } from '../engine/auth-manager.js';
import { execute as executeRequest } from '../engine/http-executor.js';
import { runAssertions } from '../engine/assertion-runner.js';
import { CollectionRunner } from '../engine/collection-runner.js';
import { ParsedArgs } from './cli-parser.js';
import { EngineContext } from '../mcp/tools/types.js';
import { ResponseStore } from '../engine/response-store.js';
import { HistoryStore } from '../engine/history-store.js';
import { AssertionResult } from '../types/assertion.js';

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

      const res = await executeRequest(req, env || undefined, auth);
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
        executeRequest
      };

      const runner = new CollectionRunner(context);
      const results = await runner.run(collectionName, { environment: env || undefined });

      if (parsed.flags.reporter === 'json') {
        console.log(JSON.stringify(results, null, 2));
      } else if (parsed.flags.reporter === 'tap') {
        console.log('TAP version 13');
        console.log(`1..${results.results.length}`);
        results.results.forEach((r: any, i: number) => {
          console.log(`${r.passed ? 'ok' : 'not ok'} ${i + 1} - ${r.requestName}`);
          if (!r.passed && r.error) {
            console.log(`  ---`);
            console.log(`  error: ${r.error}`);
            console.log(`  ...`);
          }
        });
      } else {
        console.log(`Running collection: ${collectionName}\n`);
        for (const r of results.results) {
          const mark = r.passed ? '✓' : '✗';
          const method = 'UNK';
          const status = r.response?.status || 0;
          const latency = r.response?.latency || 0;
          console.log(`  ${mark}  ${method.padEnd(5)}  ${r.requestName.padEnd(20)}  ${status}  ${latency}ms`);
          if (!r.passed && r.error) {
            console.log(`        ${r.error}`);
          }
        }
        console.log(`\nResults: ${results.passed} passed, ${results.failed} failed`);
      }

      return results.failed === 0 ? 0 : 1;
    } catch (e: any) {
      console.error(`Error running collection: ${e.message}`);
      return 1;
    }
  }
}
