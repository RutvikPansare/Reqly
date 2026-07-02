/**
 * E2E integration test: Mixed REST + GraphQL + gRPC flow
 *
 * Tests that FlowRunner correctly routes all three request types.
 * Run with: npx tsx scripts/e2e-grpc-flow-test.ts
 *
 * External dependencies:
 *   REST:    https://jsonplaceholder.typicode.com  (public, no auth)
 *   GraphQL: https://countries.trevorblades.com/   (public, no auth)
 *   gRPC:    grpcb.in:9000                         (public test server, insecure)
 */

import * as path from 'path';
import * as os from 'os';
import { CollectionManager } from '../src/engine/collection-manager.js';
import { EnvironmentManager } from '../src/engine/environment-manager.js';
import { AuthManager } from '../src/engine/auth-manager.js';
import { ResponseStore } from '../src/engine/response-store.js';
import { HistoryStore } from '../src/engine/history-store.js';
import { execute } from '../src/engine/http-executor.js';
import { FlowRunner } from '../src/engine/flow-runner.js';
import { FlowConfig } from '../src/types/index.js';

const projectDir = path.join(process.cwd(), '.reqly');
const globalConfigPath = path.join(os.homedir(), '.reqly', 'config.json');

// --- Build engine context ---
const collectionManager = new CollectionManager(projectDir);
const environmentManager = new EnvironmentManager(path.join(projectDir, 'environments.yaml'));
const authManager = new AuthManager(globalConfigPath);
const responseStore = new ResponseStore();
const historyStore = new HistoryStore();

const context: any = {
  collectionManager,
  environmentManager,
  authManager,
  responseStore,
  historyStore,
  flowManager: null,
  executeRequest: async (req: any, env: any, auth: any, truncate: any, maxBodyBytes: any, collectionVars: any, collectionAuth: any) => {
    return execute(req, env, auth, truncate ?? true, maxBodyBytes ?? 50 * 1024, collectionVars ?? {}, collectionAuth);
  },
};

// --- Define a flow that chains REST -> GraphQL -> gRPC ---
const flow: FlowConfig = {
  name: 'mixed-rest-gql-grpc-e2e',
  steps: [
    // Step 1: REST - fetch a todo from JSONPlaceholder
    {
      type: 'run',
      id: 'rest-step',
      collection: 'jsonplaceholder',
      request: 'get-todo',
    },
    // Step 2: Assert REST response is 200
    {
      type: 'assert',
      id: 'rest-assert',
      assertions: [{ field: 'status', operator: 'eq', value: 200 }],
    },
    // Step 3: Extract todo userId from REST response
    {
      type: 'extract',
      id: 'extract-user',
      from: 'response.body.userId',
      into: 'todoUserId',
    },
    // Step 4: GraphQL - query countries API
    {
      type: 'run',
      id: 'graphql-step',
      collection: 'test',
      request: 'Countries GraphQL',
    },
    // Step 5: Assert GraphQL response is 200
    {
      type: 'assert',
      id: 'graphql-assert',
      assertions: [{ field: 'status', operator: 'eq', value: 200 }],
    },
    // Step 6: gRPC - call public grpcb.in test server
    {
      type: 'run',
      id: 'grpc-step',
      collection: 'gRPC Demo',
      request: 'SayHello (unary)',
    },
    // Step 7: Assert gRPC response adapted to status 200
    {
      type: 'assert',
      id: 'grpc-assert',
      assertions: [{ field: 'status', operator: 'eq', value: 200 }],
    },
  ],
};

async function run() {
  console.log('--- E2E Flow Test: REST + GraphQL + gRPC ---\n');

  // Activate the jsonplaceholder environment if available
  try {
    const envs = await environmentManager.listEnvironments();
    const jp = envs.find((e: any) => e.name === 'jsonplaceholder');
    if (jp) await environmentManager.setActiveEnvironment(jp.name);
  } catch (_) { /* no env needed - requests use hardcoded URLs */ }

  const runner = new FlowRunner(context);
  const result = await runner.run(flow);

  console.log(`Flow: ${result.flowName}`);
  console.log(`Passed: ${result.passed}`);
  console.log(`Duration: ${result.duration}ms\n`);

  for (const step of result.steps) {
    const icon = step.passed ? '✅' : '❌';
    const res = step.response as any;
    const extra = res ? `  status=${res.status}` : '';
    if (step.error) {
      console.log(`${icon} [${step.stepId}] ${step.type} - FAILED: ${step.error}`);
    } else {
      console.log(`${icon} [${step.stepId}] ${step.type}${extra}`);
    }

    // Print gRPC body for inspection
    if (step.stepId === 'grpc-step' && res?.body) {
      console.log(`   gRPC body: ${JSON.stringify(res.body)}`);
    }
    // Print extracted GraphQL country name
    if (step.stepId === 'graphql-step' && res?.body) {
      try {
        const name = (res.body as any)?.data?.country?.name;
        if (name) console.log(`   GraphQL country: ${name}`);
      } catch (_) {}
    }
  }

  console.log('');
  if (!result.passed) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
