/**
 * T-243 Layer 1: MCP end-to-end regression suite.
 *
 * Boots a live Reqly server (MCP stdio + Express in one process) against a
 * writable copy of tests/e2e/fixture-project, connects as a real MCP client,
 * exercises every tool in the regression list, and prints a pass/fail table.
 * Exits 1 on any failure.
 *
 * Run: npm run test:e2e:mcp
 * Requires network access (httpbin.org, countries.trevorblades.com,
 * grpcb.in:9000, echo.websocket.org).
 */
import * as path from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createSandbox, repoRoot } from './helpers/fixture.js';

const MOCK_PORT = 4299;

interface CheckResult {
  name: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

/** Calls a tool and returns its parsed JSON payload. Throws on isError. */
async function callTool(client: Client, name: string, args: Record<string, unknown> = {}): Promise<any> {
  const result: any = await client.callTool({ name, arguments: args });
  const text = result.content?.[0]?.text ?? '';
  if (result.isError) {
    throw new Error(`${name} returned isError: ${text}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const sandbox = await createSandbox('mcp', { REQLY_TEST_PORT: '0' });

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs'), path.join(repoRoot, 'src', 'server', 'index.ts'), 'start', '--project-dir', sandbox.projectDir],
    cwd: repoRoot,
    env: sandbox.env,
    stderr: 'pipe',
  });
  // Surface server-side logs when debugging: REQLY_E2E_DEBUG=1
  if (process.env.REQLY_E2E_DEBUG) {
    transport.stderr?.on('data', (d: Buffer) => process.stderr.write(`[server] ${d}`));
  } else {
    transport.stderr?.resume();
  }

  const client = new Client({ name: 'reqly-e2e-regression', version: '1.0.0' });
  await client.connect(transport);

  const results: CheckResult[] = [];
  const check = async (name: string, fn: () => Promise<void>) => {
    const started = Date.now();
    try {
      await fn();
      results.push({ name, passed: true, durationMs: Date.now() - started });
    } catch (e: any) {
      results.push({ name, passed: false, error: e.message, durationMs: Date.now() - started });
    }
  };

  await check('list_collections returns fixture collections', async () => {
    const cols = await callTool(client, 'list_collections');
    const names = cols.map((c: any) => c.name);
    for (const expected of ['httpbin', 'graphql-demo', 'mock-demo']) {
      assert(names.includes(expected), `missing collection "${expected}" in ${JSON.stringify(names)}`);
    }
    const httpbin = cols.find((c: any) => c.name === 'httpbin');
    const reqNames = httpbin.requests.map((r: any) => r.name);
    assert(reqNames.includes('httpbin-get'), `missing request httpbin-get in ${JSON.stringify(reqNames)}`);
  });

  await check('create_request adds a request to the httpbin collection', async () => {
    const created = await callTool(client, 'create_request', {
      collectionName: 'httpbin',
      request: {
        id: 'req-e2e-created',
        name: 'created-anything',
        method: 'POST',
        url: '{{baseUrl}}/anything',
        headers: { 'Content-Type': 'application/json' },
        body: { probe: 'reqly-e2e' },
      },
    });
    assert(created.success === true, `unexpected create_request response: ${JSON.stringify(created)}`);
  });

  await check('run_request fires the created request end-to-end (httpbin.org)', async () => {
    const res = await callTool(client, 'run_request', { collectionName: 'httpbin', requestName: 'created-anything' });
    assert(res.response.status === 200, `expected 200, got ${res.response?.status}`);
    assert(Array.isArray(res.testResults), 'testResults array missing');
  });

  await check('run_request resolves {{baseUrl}} and runs postScript tests', async () => {
    const res = await callTool(client, 'run_request', { collectionName: 'httpbin', requestName: 'httpbin-get' });
    assert(res.response.status === 200, `expected 200, got ${res.response?.status}`);
    assert(res.testResults.length === 2, `expected 2 testResults, got ${res.testResults.length}`);
    for (const t of res.testResults) {
      assert(t.passed, `postScript test "${t.name}" failed: ${t.error}`);
    }
  });

  await check('get_response retrieves the cached response', async () => {
    const res = await callTool(client, 'get_response', { requestName: 'httpbin-get' });
    assert(res.status === 200, `expected cached 200, got ${res.status}`);
  });

  await check('set_environment + get_variables resolves the staging environment', async () => {
    const set = await callTool(client, 'set_environment', { environmentName: 'staging' });
    assert(set.success === true && set.active === 'staging', `unexpected set_environment response: ${JSON.stringify(set)}`);
    const vars = await callTool(client, 'get_variables', {});
    const apiLabel = vars.find((v: any) => v.key === 'apiLabel');
    assert(apiLabel?.value === 'staging' && apiLabel?.source === 'staging', `apiLabel did not resolve from staging: ${JSON.stringify(vars)}`);
    assert(vars.some((v: any) => v.key === 'baseUrl'), `baseUrl variable missing: ${JSON.stringify(vars)}`);
  });

  await check('run_collection runs every request and reports testResults', async () => {
    const run = await callTool(client, 'run_collection', { collectionName: 'httpbin' });
    assert(Array.isArray(run.results), `results array missing: ${JSON.stringify(run).slice(0, 300)}`);
    assert(run.results.length >= 3, `expected >= 3 results, got ${run.results.length}`);
    for (const r of run.results) {
      assert(r.passed === true, `request "${r.requestName}" failed in collection run`);
      assert(Array.isArray(r.testResults), `testResults missing on ${r.requestName}`);
    }
    assert(run.stoppedEarly === false || run.stoppedEarly === undefined, 'collection stopped early unexpectedly');
  });

  await check('run_flow executes run + extract + assert steps', async () => {
    const flow = await callTool(client, 'run_flow', { name: 'smoke' });
    assert(flow.flowName === 'smoke', `unexpected flowName: ${flow.flowName}`);
    assert(flow.passed === true, `flow failed: ${JSON.stringify(flow.steps)}`);
    assert(flow.steps.length === 3, `expected 3 steps, got ${flow.steps.length}`);
  });

  await check('run_request executes a GraphQL request (countries API)', async () => {
    const res = await callTool(client, 'run_request', { collectionName: 'graphql-demo', requestName: 'countries' });
    assert(res.response.status === 200, `expected 200, got ${res.response?.status}`);
    const body = typeof res.response.body === 'string' ? JSON.parse(res.response.body) : res.response.body;
    assert(body.data?.country?.name === 'United States', `unexpected GraphQL body: ${JSON.stringify(body).slice(0, 200)}`);
  });

  await check('introspect_graphql summarises the countries schema', async () => {
    const schema = await callTool(client, 'introspect_graphql', { url: 'https://countries.trevorblades.com/' });
    assert(schema.queryType, 'queryType missing');
    assert(Array.isArray(schema.types) && schema.types.length > 0, 'types array empty');
    const country = schema.types.find((t: any) => t.name === 'Country');
    assert(country, 'Country type missing from introspection summary');
  });

  await check('list_grpc_services discovers services via reflection (grpcb.in)', async () => {
    const summary = await callTool(client, 'list_grpc_services', { serverUrl: 'grpcb.in:9000', insecure: true });
    assert(Array.isArray(summary.services) && summary.services.length > 0, `no services returned: ${JSON.stringify(summary).slice(0, 200)}`);
  });

  await check('run_realtime captures a WebSocket echo (echo.websocket.org)', async () => {
    const rt = await callTool(client, 'run_realtime', {
      type: 'websocket',
      url: 'wss://echo.websocket.org',
      captureTimeout: 6,
      sendMessages: [{ message: 'reqly-e2e-ping' }],
    });
    assert(!rt.isError, `realtime capture errored: ${rt.errorMessage}`);
    assert(Array.isArray(rt.messages) && rt.messages.length > 0, 'no messages captured');
    assert(typeof rt.truncated === 'boolean', 'truncated flag missing');
    const echoed = rt.messages.some((m: any) => m.source === 'server' && String(m.payload).includes('reqly-e2e-ping'));
    assert(echoed, `echo not received: ${JSON.stringify(rt.messages).slice(0, 400)}`);
  });

  await check('start_mock serves a saved example, stop_mock tears it down', async () => {
    const started = await callTool(client, 'start_mock', { collection: 'mock-demo', port: MOCK_PORT });
    assert(started.port === MOCK_PORT, `expected port ${MOCK_PORT}, got ${started.port}`);
    const res = await fetch(`http://localhost:${MOCK_PORT}/users`);
    assert(res.status === 200, `mock route returned ${res.status}`);
    const body: any = await res.json();
    assert(body.users?.length === 2, `unexpected mock body: ${JSON.stringify(body)}`);
    await callTool(client, 'stop_mock', {});
    const afterStop = await fetch(`http://localhost:${MOCK_PORT}/users`).then(() => true).catch(() => false);
    assert(!afterStop, 'mock server still answering after stop_mock');
  });

  await check('export_collection produces a Postman v2.1 document', async () => {
    const exported = await callTool(client, 'export_collection', { collectionName: 'httpbin', format: 'postman' });
    const doc = JSON.parse(exported.content);
    assert(String(doc.info?.schema).includes('v2.1.0'), `unexpected schema: ${doc.info?.schema}`);
    assert(Array.isArray(doc.item) && doc.item.length > 0, 'exported item array empty');
  });

  await check('generate_code emits a cURL snippet', async () => {
    const gen = await callTool(client, 'generate_code', {
      method: 'GET',
      url: 'https://httpbin.org/get',
      target: 'curl',
      headers: { Accept: 'application/json' },
    });
    assert(gen.target === 'curl', `unexpected target: ${gen.target}`);
    assert(gen.code.includes('curl') && gen.code.includes('https://httpbin.org/get'), `unexpected snippet: ${gen.code}`);
  });

  await check('set_collection_spec + validate_response validates against the fixture OpenAPI spec', async () => {
    const specPath = path.join(sandbox.projectDir, 'openapi.json');
    const set = await callTool(client, 'set_collection_spec', { collection: 'httpbin', specPath });
    assert(set.operationCount === 1, `expected 1 spec operation, got ${set.operationCount}`);
    const validated = await callTool(client, 'validate_response', { collection: 'httpbin', request: 'httpbin-get' });
    assert(validated.matched === true, `request did not match a spec operation: ${JSON.stringify(validated)}`);
    assert(Array.isArray(validated.violations) && validated.violations.length === 0, `unexpected violations: ${JSON.stringify(validated.violations)}`);
  });

  await check('workspace model: create + link + use + list against isolated $HOME', async () => {
    const created = await callTool(client, 'create_workspace', { name: 'e2e-team' });
    assert(created.name === 'e2e-team', `unexpected create_workspace response: ${JSON.stringify(created)}`);
    const linked = await callTool(client, 'link_workspace_repo', { workspace: 'e2e-team', alias: 'fixture', path: sandbox.projectDir });
    assert(linked.repos?.some((r: any) => r.alias === 'fixture' && r.path === sandbox.projectDir), `repo not linked: ${JSON.stringify(linked)}`);
    const used = await callTool(client, 'use_workspace', { name: 'e2e-team' });
    assert(used.active === 'e2e-team', `unexpected use_workspace response: ${JSON.stringify(used)}`);
    const listed = await callTool(client, 'list_workspaces');
    assert(listed.active === 'e2e-team', `active workspace not persisted: ${JSON.stringify(listed)}`);
    assert(listed.workspaces.some((w: any) => w.name === 'e2e-team'), 'workspace missing from list');
  });

  await client.close();
  await sandbox.cleanup();

  // Pass/fail table
  const width = Math.max(...results.map(r => r.name.length));
  console.log('\nMCP regression results');
  console.log('-'.repeat(width + 18));
  for (const r of results) {
    const status = r.passed ? 'PASS' : 'FAIL';
    console.log(`${status}  ${r.name.padEnd(width)}  ${String(r.durationMs).padStart(6)}ms`);
    if (!r.passed) console.log(`      -> ${r.error}`);
  }
  const failed = results.filter(r => !r.passed);
  console.log('-'.repeat(width + 18));
  console.log(`${results.length - failed.length}/${results.length} passed`);

  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('MCP regression suite crashed:', e);
  process.exit(1);
});
