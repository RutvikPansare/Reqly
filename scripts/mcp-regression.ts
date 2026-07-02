/**
 * MCP regression test: verifies key tools work after v2 arch changes.
 * REST, GraphQL, SigV4 auth, disk-persisted history, switch_project.
 * Run with: npx tsx scripts/mcp-regression.ts
 */
import { spawn } from 'child_process';

const TEST_PORT = 14200 + Math.floor(Math.random() * 30);
const TEST_COLLECTION = '_reqly_regression_test';

interface McpResult { content?: Array<{ type: string; text: string }>; isError?: boolean; }

let msgId = 0;

async function callMcp(proc: ReturnType<typeof spawn>, method: string, args: Record<string, unknown> = {}): Promise<any> {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    let buf = '';
    const onData = (chunk: Buffer) => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const l of lines) {
        if (!l.trim()) continue;
        try {
          const msg = JSON.parse(l);
          if (msg.id !== id) continue;
          proc.stdout?.off('data', onData);
          const res: McpResult = msg.result;
          const text = res?.content?.[0]?.text ?? '';
          if (res?.isError) { resolve({ isError: true, text }); return; }
          try { resolve(JSON.parse(text)); } catch { resolve({ text }); }
        } catch {}
      }
    };
    proc.stdout?.on('data', onData);
    setTimeout(() => { proc.stdout?.off('data', onData); reject(new Error('timeout: ' + method)); }, 30000);
    proc.stdin?.write(JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: method, arguments: args } }) + '\n');
  });
}

async function initMcp(proc: ReturnType<typeof spawn>): Promise<void> {
  const id = ++msgId;
  return new Promise((resolve) => {
    let buf = '';
    const onData = (chunk: Buffer) => {
      buf += chunk.toString();
      for (const l of buf.split('\n')) {
        try { const m = JSON.parse(l); if (m.id === id) { proc.stdout?.off('data', onData); resolve(); } } catch {}
      }
      buf = buf.split('\n').pop() ?? '';
    };
    proc.stdout?.on('data', onData);
    proc.stdin?.write(JSON.stringify({ jsonrpc: '2.0', id, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'regression', version: '1' } } }) + '\n');
  });
}

let pass = 0; let fail = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { console.log(`  ✅ ${label}`); pass++; }
  else     { console.log(`  ❌ ${label}${detail ? ': ' + detail : ''}`); fail++; }
}

let proc: ReturnType<typeof spawn> | null = null;
process.on('exit', () => { try { proc?.kill(); } catch {} });
process.on('uncaughtException', (e) => { console.error('Fatal:', e.message); proc?.kill(); process.exit(1); });

async function main() {
  proc = spawn('node', ['dist/server/index.js'], {
    env: { ...process.env, REQLY_TEST_PORT: String(TEST_PORT) },
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: process.cwd(),
  });

  // Wait for server ready signal
  await new Promise<void>((resolve) => {
    proc!.stderr?.on('data', (d: Buffer) => {
      const s = d.toString();
      if (s.includes('listening') || s.includes('MCP server')) resolve();
    });
    setTimeout(resolve, 4000);
  });

  await initMcp(proc!);
  proc!.stdin?.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  console.log(`MCP initialized (port ${TEST_PORT})\n`);

  // 1. list_collections
  console.log('--- 1. list_collections ---');
  const cols = await callMcp(proc!, 'list_collections');
  check('Returns array', Array.isArray(cols), typeof cols);

  // 2. create collection + REST request
  console.log('\n--- 2. create collection + REST request ---');
  const createCol = await callMcp(proc!, 'create_collection', { name: TEST_COLLECTION });
  check('create_collection ok', !createCol.isError, JSON.stringify(createCol));

  const createReq = await callMcp(proc!, 'create_request', {
    collectionName: TEST_COLLECTION,
    request: { name: 'httpbin-get', method: 'GET', url: 'https://httpbin.org/get' },
  });
  check('create_request ok', !createReq.isError, JSON.stringify(createReq));

  // 3. run_request (REST)
  console.log('\n--- 3. run_request (REST GET) ---');
  const restRaw = await callMcp(proc!, 'run_request', { collectionName: TEST_COLLECTION, requestName: 'httpbin-get' });
  const restRes = restRaw.response ?? restRaw;
  check('Status 200', restRes.status === 200, `got ${restRes.status}`);
  check('Response has body', !!restRes.body);
  check('Not error', !restRaw.isError);

  // 4. get_history via REST (disk-persisted)
  console.log('\n--- 4. get_history via REST (disk-persisted) ---');
  try {
    const histResp = await fetch(`http://localhost:${TEST_PORT}/api/history`);
    const histText = await histResp.text();
    const histData = JSON.parse(histText);
    // histData is a plain array - avoid .entries which is Array.prototype.entries()
    const entries: any[] = Array.isArray(histData) ? histData : (histData?.history ?? []);
    check('History has entries', entries.length > 0, `count=${entries.length}`);
    check('Latest is GET', entries[0]?.method === 'GET', `method=${entries[0]?.method}`);
  } catch (e: any) {
    check('History endpoint accessible', false, e.message);
    check('Latest is GET', false, 'skipped');
  }

  // 5. get_response (response store)
  console.log('\n--- 5. get_response (response store) ---');
  const respData = await callMcp(proc!, 'get_response', { requestName: 'httpbin-get' });
  check('Response store has entry', !respData.isError && respData.status === 200, JSON.stringify(respData)?.substring(0, 80));

  // 6. GraphQL request (type: graphql auto-sets POST in executor)
  console.log('\n--- 6. GraphQL request ---');
  const createGql = await callMcp(proc!, 'create_request', {
    collectionName: TEST_COLLECTION,
    request: { name: 'countries-gql', type: 'graphql', url: 'https://countries.trevorblades.com/graphql', graphql: { query: '{ countries { code name } }' } },
  });
  check('create GraphQL request ok', !createGql.isError, JSON.stringify(createGql));

  const gqlRaw = await callMcp(proc!, 'run_request', { collectionName: TEST_COLLECTION, requestName: 'countries-gql' });
  const gqlRes = gqlRaw.response ?? gqlRaw;
  check('GQL status 200', gqlRes.status === 200, `got ${gqlRes.status}`);
  const gqlData = gqlRes.body?.data ?? gqlRes.body;
  check('GQL has countries data', Array.isArray(gqlData?.countries) && gqlData.countries.length > 0,
    `countries=${JSON.stringify(gqlData?.countries)?.substring(0, 60)}`);

  // 7. AWS SigV4 auth (T-218 regression)
  console.log('\n--- 7. AWS SigV4 auth ---');
  const createSig = await callMcp(proc!, 'create_request', {
    collectionName: TEST_COLLECTION,
    request: {
      name: 'httpbin-sigv4', method: 'GET', url: 'https://httpbin.org/get',
      auth: { type: 'awsv4', credentials: { accessKey: 'AKIAIOSFODNN7EXAMPLE', secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', region: 'us-east-1', service: 'execute-api' } },
    },
  });
  check('create SigV4 request ok', !createSig.isError, JSON.stringify(createSig));

  const sigRaw = await callMcp(proc!, 'run_request', { collectionName: TEST_COLLECTION, requestName: 'httpbin-sigv4' });
  const sigRes = sigRaw.response ?? sigRaw;
  const authHeader: string = sigRes.body?.headers?.Authorization ?? sigRes.body?.headers?.authorization ?? '';
  check('SigV4 status 200', sigRes.status === 200, `got ${sigRes.status}`);
  check('Authorization header injected', authHeader.startsWith('AWS4-HMAC-SHA256'), `got: ${authHeader.substring(0, 50)}`);

  // 8. switch_project (local context swap - T-223)
  console.log('\n--- 8. switch_project (local context swap) ---');
  const switchRes = await callMcp(proc!, 'switch_project', { projectDir: process.cwd() });
  check('switch_project ok', switchRes.ok === true, JSON.stringify(switchRes));

  // 9. get_project
  console.log('\n--- 9. get_project ---');
  const projData = await callMcp(proc!, 'get_project', {});
  check('Returns projectDir', typeof projData.projectDir === 'string');

  // Cleanup
  await callMcp(proc!, 'delete_collection', { collectionName: TEST_COLLECTION }).catch(() => {});

  // Summary
  console.log('\n' + '─'.repeat(50));
  console.log(`Results: ${pass} passed, ${fail} failed`);
  proc!.kill();
  process.exit(fail > 0 ? 1 : 0);
}

main();
