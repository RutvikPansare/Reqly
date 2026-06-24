import { CollectionManager } from '../engine/collection-manager.js';
import { EnvironmentManager } from '../engine/environment-manager.js';
import { AuthManager } from '../engine/auth-manager.js';
import { execute as executeRequest } from '../engine/http-executor.js';
import { runAssertions } from '../engine/assertion-runner.js';
import { CollectionRunner } from '../engine/collection-runner.js';
import { ParsedArgs } from './cli-parser.js';

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
      let assertionsResult = undefined;
      let passed = true;

      if (req.assertions && req.assertions.length > 0) {
        assertionsResult = runAssertions(res, req.assertions);
        passed = assertionsResult.passed;
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
            error: assertionsResult && !passed ? assertionsResult.results.find((r: any) => !r.passed)?.error : undefined
          }]
        }, null, 2));
      } else if (parsed.flags.reporter === 'tap') {
        console.log('TAP version 13');
        console.log('1..1');
        console.log(`${passed ? 'ok' : 'not ok'} 1 - ${req.name}`);
        if (!passed && assertionsResult) {
          const failedAssert = assertionsResult.results.find((r: any) => !r.passed);
          console.log(`  ---`);
          console.log(`  error: ${failedAssert?.error}`);
          console.log(`  ...`);
        }
      } else {
        console.log(`Running request: ${collectionName} > ${requestName}\n`);
        const mark = passed ? '✓' : '✗';
        console.log(`  ${mark}  ${req.method.padEnd(5)}  ${req.name.padEnd(20)}  ${res.status}  ${res.latency}ms`);
        if (!passed && assertionsResult) {
          const failedAssert = assertionsResult.results.find((r: any) => !r.passed);
          console.log(`        ${failedAssert?.error}`);
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
      const collection = await collectionManager.getCollection(collectionName);
      const runner = new CollectionRunner(collection, env || undefined, authManager);
      const results = await runner.runAll();

      let passedCount = 0;
      let failedCount = 0;

      for (const r of results) {
        if (r.passed) passedCount++;
        else failedCount++;
      }

      if (parsed.flags.reporter === 'json') {
        console.log(JSON.stringify({
          collection: collectionName,
          passed: passedCount,
          failed: failedCount,
          results: results.map((r: any) => ({
            name: r.requestName,
            method: r.response?.request?.method || 'UNK',
            status: r.response?.status || 0,
            latency: r.response?.latency || 0,
            passed: r.passed,
            error: r.error
          }))
        }, null, 2));
      } else if (parsed.flags.reporter === 'tap') {
        console.log('TAP version 13');
        console.log(`1..${results.length}`);
        results.forEach((r: any, i: number) => {
          console.log(`${r.passed ? 'ok' : 'not ok'} ${i + 1} - ${r.requestName}`);
          if (!r.passed && r.error) {
            console.log(`  ---`);
            console.log(`  error: ${r.error}`);
            console.log(`  ...`);
          }
        });
      } else {
        console.log(`Running collection: ${collectionName}\n`);
        for (const r of results) {
          const mark = r.passed ? '✓' : '✗';
          const method = r.response?.request?.method || 'UNK';
          const status = r.response?.status || 0;
          const latency = r.response?.latency || 0;
          console.log(`  ${mark}  ${method.padEnd(5)}  ${r.requestName.padEnd(20)}  ${status}  ${latency}ms`);
          if (!r.passed && r.error) {
            console.log(`        ${r.error}`);
          }
        }
        console.log(`\nResults: ${passedCount} passed, ${failedCount} failed`);
      }

      return failedCount === 0 ? 0 : 1;
    } catch (e: any) {
      console.error(`Error running collection: ${e.message}`);
      return 1;
    }
  }
}
