/**
 * E2E integration test for AWS SigV4 authentication.
 *
 * Directly calls the engine functions (same pattern as e2e-grpc-flow-test.ts).
 * Tests header injection (REST GET, REST POST, session token) and WebSocket URL presigning.
 *
 * External dependencies:
 *   httpbin.org - echoes request headers back in response body (no auth required)
 *
 * Run with: npx tsx scripts/e2e-sigv4-test.ts
 */

import { execute } from '../src/engine/http-executor.js';
import { signRealtimeUrlForAws } from '../src/engine/realtime-executor.js';
import { AuthType } from '../src/types/index.js';

let pass = 0;
let fail = 0;

function check(label: string, ok: boolean, detail?: string) {
  if (ok) { console.log(`  ✅ ${label}`); pass++; }
  else     { console.log(`  ❌ ${label}${detail ? ' - ' + detail : ''}`); fail++; }
}

async function main() {

  // ------------------------------------------------------------------
  // TEST 1: GET with SigV4 - Authorization and X-Amz-Date injected
  // ------------------------------------------------------------------
  console.log('\n--- Test 1: GET https://httpbin.org/get with AWS SigV4 ---');
  try {
    const res = await execute(
      { method: 'GET', url: 'https://httpbin.org/get', headers: {} },
      {},
      {
        type: AuthType.AWS_V4,
        credentials: {
          accessKey: 'AKIAIOSFODNN7EXAMPLE',
          secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
          region: 'us-east-1',
          service: 'execute-api',
        },
      },
      false, 1024 * 1024, {}, undefined
    );
    const body = typeof res.body === 'string' ? JSON.parse(res.body) : res.body as Record<string, unknown>;
    const hdrs = body.headers as Record<string, string>;
    const auth: string = hdrs['Authorization'] ?? hdrs['authorization'] ?? '';
    const date: string = hdrs['X-Amz-Date'] ?? hdrs['x-amz-date'] ?? '';

    console.log('  Status:', res.status);
    console.log('  Authorization:', auth.substring(0, 75) + '...');
    console.log('  X-Amz-Date:', date);

    check('Status 200', res.status === 200);
    check('Authorization starts with AWS4-HMAC-SHA256', auth.startsWith('AWS4-HMAC-SHA256'));
    check('Credential contains key ID', auth.includes('AKIAIOSFODNN7EXAMPLE'));
    check('Region us-east-1 in credential scope', auth.includes('/us-east-1/'));
    check('Service execute-api in credential scope', auth.includes('/execute-api/'));
    check('aws4_request terminator present', auth.includes('/aws4_request'));
    check('SignedHeaders field present', auth.includes('SignedHeaders='));
    check('Signature field present', auth.includes('Signature='));
    check('X-Amz-Date has correct format (YYYYMMDDTHHmmssZ)', /^\d{8}T\d{6}Z$/.test(date));
  } catch (e: any) {
    console.log('  ❌ Exception:', e.message);
    fail++;
  }

  // ------------------------------------------------------------------
  // TEST 2: POST with body - different region and service
  // ------------------------------------------------------------------
  console.log('\n--- Test 2: POST https://httpbin.org/post with body (eu-west-1 / bedrock) ---');
  try {
    const res = await execute(
      {
        method: 'POST',
        url: 'https://httpbin.org/post',
        headers: { 'Content-Type': 'application/json' },
        body: '{"hello":"reqly"}',
      },
      {},
      {
        type: AuthType.AWS_V4,
        credentials: {
          accessKey: 'AKIAIOSFODNN7EXAMPLE',
          secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
          region: 'eu-west-1',
          service: 'bedrock',
        },
      },
      false, 1024 * 1024, {}, undefined
    );
    const body = typeof res.body === 'string' ? JSON.parse(res.body) : res.body as Record<string, unknown>;
    const hdrs = body.headers as Record<string, string>;
    const auth: string = hdrs['Authorization'] ?? hdrs['authorization'] ?? '';

    console.log('  Status:', res.status);
    console.log('  Authorization (first 80):', auth.substring(0, 80) + '...');

    check('Status 200', res.status === 200);
    check('Region eu-west-1 in credential scope', auth.includes('/eu-west-1/'));
    check('Service bedrock in credential scope', auth.includes('/bedrock/'));
  } catch (e: any) {
    console.log('  ❌ Exception:', e.message);
    fail++;
  }

  // ------------------------------------------------------------------
  // TEST 3: Temporary credentials - X-Amz-Security-Token injected
  // ------------------------------------------------------------------
  console.log('\n--- Test 3: GET with session token (X-Amz-Security-Token) ---');
  try {
    const res = await execute(
      { method: 'GET', url: 'https://httpbin.org/get', headers: {} },
      {},
      {
        type: AuthType.AWS_V4,
        credentials: {
          accessKey: 'ASIAIOSFODNN7EXAMPLE',
          secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
          region: 'us-west-2',
          service: 'sts',
          sessionToken: 'FQoGZXIvYXdzEBQaDEXAMPLETOKENXYZ',
        },
      },
      false, 1024 * 1024, {}, undefined
    );
    const body = typeof res.body === 'string' ? JSON.parse(res.body) : res.body as Record<string, unknown>;
    const hdrs = body.headers as Record<string, string>;
    const secToken: string = hdrs['X-Amz-Security-Token'] ?? hdrs['x-amz-security-token'] ?? '';
    const auth: string = hdrs['Authorization'] ?? hdrs['authorization'] ?? '';

    console.log('  Status:', res.status);
    console.log('  X-Amz-Security-Token:', secToken ? secToken.substring(0, 30) + '...' : '(missing)');

    check('Status 200', res.status === 200);
    check('X-Amz-Security-Token header injected', secToken.length > 0);
    check('Session token value echoed correctly', secToken === 'FQoGZXIvYXdzEBQaDEXAMPLETOKENXYZ');
    check('Region us-west-2 in credential scope', auth.includes('/us-west-2/'));
    check('Service sts in credential scope', auth.includes('/sts/'));
  } catch (e: any) {
    console.log('  ❌ Exception:', e.message);
    fail++;
  }

  // ------------------------------------------------------------------
  // TEST 4: WebSocket URL presigning (no live endpoint needed)
  // ------------------------------------------------------------------
  console.log('\n--- Test 4: WebSocket URL presigning via signRealtimeUrlForAws ---');
  try {
    const signed = signRealtimeUrlForAws(
      'wss://example.appsync-realtime-api.us-east-1.amazonaws.com/graphql',
      {
        accessKey: 'AKIAIOSFODNN7EXAMPLE',
        secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        region: 'us-east-1',
        service: 'appsync',
      }
    );
    const url = new URL(signed);

    console.log('  Scheme:', url.protocol);
    console.log('  X-Amz-Algorithm:', url.searchParams.get('X-Amz-Algorithm'));
    console.log('  X-Amz-Date:', url.searchParams.get('X-Amz-Date'));
    console.log('  X-Amz-Credential (first 35):', (url.searchParams.get('X-Amz-Credential') ?? '').substring(0, 35) + '...');
    console.log('  X-Amz-Signature present:', url.searchParams.has('X-Amz-Signature'));

    check('wss:// scheme preserved after signing', url.protocol === 'wss:');
    check('X-Amz-Algorithm is AWS4-HMAC-SHA256', url.searchParams.get('X-Amz-Algorithm') === 'AWS4-HMAC-SHA256');
    check('X-Amz-Date has correct format', /^\d{8}T\d{6}Z$/.test(url.searchParams.get('X-Amz-Date') ?? ''));
    check('X-Amz-Credential contains key ID', (url.searchParams.get('X-Amz-Credential') ?? '').startsWith('AKIAIOSFODNN7EXAMPLE'));
    check('X-Amz-Credential contains region', (url.searchParams.get('X-Amz-Credential') ?? '').includes('us-east-1'));
    check('X-Amz-Credential contains service', (url.searchParams.get('X-Amz-Credential') ?? '').includes('appsync'));
    check('X-Amz-Credential ends with /aws4_request', (url.searchParams.get('X-Amz-Credential') ?? '').includes('/aws4_request'));
    check('X-Amz-Signature present', url.searchParams.has('X-Amz-Signature'));
  } catch (e: any) {
    console.log('  ❌ Exception:', e.message);
    fail++;
  }

  // ------------------------------------------------------------------
  // TEST 5: WebSocket presigning with session token
  // ------------------------------------------------------------------
  console.log('\n--- Test 5: WebSocket URL presigning with session token ---');
  try {
    const signed = signRealtimeUrlForAws(
      'wss://iotcore.us-east-1.amazonaws.com/mqtt',
      {
        accessKey: 'ASIAIOSFODNN7EXAMPLE',
        secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        sessionToken: 'SESSIONTOKENEXAMPLE',
        region: 'us-east-1',
        service: 'iotdevicegateway',
      }
    );
    const url = new URL(signed);

    console.log('  X-Amz-Security-Token present:', url.searchParams.has('X-Amz-Security-Token'));
    console.log('  Token value:', url.searchParams.get('X-Amz-Security-Token'));

    check('wss:// scheme preserved', url.protocol === 'wss:');
    check('X-Amz-Security-Token in query params', url.searchParams.has('X-Amz-Security-Token'));
    check('Session token value correct', url.searchParams.get('X-Amz-Security-Token') === 'SESSIONTOKENEXAMPLE');
  } catch (e: any) {
    console.log('  ❌ Exception:', e.message);
    fail++;
  }

  // ------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------
  console.log(`\n${'─'.repeat(55)}`);
  console.log(`Results: ${pass} passed, ${fail} failed out of ${pass + fail} checks`);
  if (fail > 0) { console.log('❌ Some checks failed'); process.exit(1); }
  else           { console.log('✅ All checks passed'); }
}

main().catch(e => { console.error(e); process.exit(1); });
