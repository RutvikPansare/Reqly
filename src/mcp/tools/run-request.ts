import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';
import { checkContract } from './contract-helper.js';

export const definition: ToolDefinition = {
  name: 'run_request',
  description: "Fires a saved request and returns the response. When to use: to verify a request actually works after creating it, or to debug a failing endpoint. Preferred pattern: call list_collections first if you don't know the exact request name. If the response is a 401, use set_variable to set the auth token then retry. GraphQL requests (type: graphql) include a graphql block with query, variables, and an optional operationName (required when the document contains multiple named operations); {{variables}} inside the query text and the variables object resolve with the same precedence as REST bodies (collection vars > env vars). gRPC requests (type: grpc) return { grpcStatus, grpcStatusCode, body, latency, isError?, errorMessage? } - grpcStatus is the human-readable gRPC status name (OK, NOT_FOUND, UNIMPLEMENTED, UNAVAILABLE etc.); grpcStatusCode is the numeric code; body is the decoded response message. gRPC headers are passed as Metadata automatically. Auth profiles (bearer, API key) are injected into gRPC Metadata the same way as REST headers. Return shape includes a testResults array: [{ name: string, passed: boolean, error?: string }] - one entry per test() call in the request's postScript; empty array if the request has no postScript or no test() calls. postScript supports two Chai plugins: expect(val).to.have.jsonSchema(schema) validates against a JSON Schema; expect(val).to.have.jsonBody(subset) does partial deep-match ignoring extra fields. Both produce entries in testResults. AWS SigV4 auth (type: awsv4): set credentials { accessKey, secretKey, region, service, sessionToken? } on the auth profile. The executor computes Authorization, X-Amz-Date (and X-Amz-Security-Token when sessionToken is set) headers before the request fires - works for any AWS service (API Gateway, AppSync, Bedrock, S3, etc.).",
  inputSchema: {
    type: 'object',
    properties: {
      collectionName: { type: 'string' },
      requestName: { type: 'string' },
      truncate: { type: 'boolean', description: 'Whether to truncate large responses (default: true)' }
    },
    required: ['collectionName', 'requestName']
  }
};

export async function handler(args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    const req = await context.collectionManager.getRequest(args.collectionName, args.requestName);

    // Route gRPC requests to the dedicated runner.
    if (req.type === 'grpc') {
      return handleGrpcRequest(req, args, context);
    }

    const env = await context.environmentManager.getActiveEnvironment();
    
    let auth;
    if (req.authProfileId) {
      auth = await context.authManager.getProfile(req.authProfileId);
    }

    const shouldTruncate = args.truncate !== undefined ? args.truncate : true;
    const collectionVars = await context.collectionManager.getCollectionVariables(args.collectionName);
    const { resolveCollectionAuth } = await import('../../engine/collection-auth.js');
    const collectionAuth = await resolveCollectionAuth(
      await context.collectionManager.getCollectionAuth(args.collectionName),
      context.authManager,
    );
    const res = await context.executeRequest(req, env || undefined, auth, shouldTruncate, undefined, collectionVars, collectionAuth, args.collectionName);

    let assertionsResult = undefined;
    if (req.assertions && req.assertions.length > 0) {
      const { runAssertions } = await import('../../engine/assertion-runner.js');
      assertionsResult = runAssertions(res, req.assertions);
    }

    // Store in cache and history
    context.responseStore.set(req.name, res);
    context.responseStore.saveSync();
    context.historyStore.append(req, res, { collectionName: args.collectionName });

    // Compute diff against the previous run (the entry we just appended is [0],
    // the prior run is [1] if it exists)
    let diff = undefined;
    const lastTwo = context.historyStore.getLastTwo(req.name);
    if (lastTwo.length === 2) {
      const { diffResponses } = await import('../../engine/response-differ.js');
      diff = diffResponses(lastTwo[1], lastTwo[0]);
    }

    // Strip fullBody so we don't blow up the agent's context window
    const agentResponse = { ...res };
    delete agentResponse.fullBody;

    const contractResult = await checkContract(context, args.collectionName, req, res);
    const contractViolations = contractResult ? contractResult.violations : null;

    const testResults = agentResponse.testResults ?? [];
    return { content: [{ type: 'text', text: JSON.stringify({ response: agentResponse, assertions: assertionsResult, diff, contractViolations, testResults }) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}

async function handleGrpcRequest(req: any, args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    const grpcCfg = req.grpc;
    if (!grpcCfg) {
      return { content: [{ type: 'text', text: 'gRPC request is missing a grpc config block (protoFile, service, method)' }], isError: true };
    }

    // Resolve variables in the server URL.
    const env = await context.environmentManager.getActiveEnvironment();
    const collectionVars = await context.collectionManager.getCollectionVariables(args.collectionName);
    const { resolveVariables } = await import('../../engine/variable-substitutor.js');
    const envVars = env?.variables ?? {};
    const resolvedUrl = resolveVariables(req.url, [collectionVars, envVars]);

    // Build metadata from headers + auth profile (T-165).
    const metadata: Record<string, string> = {};

    // 1. Collection-level auth -> inject into metadata
    const { resolveCollectionAuth } = await import('../../engine/collection-auth.js');
    const collectionAuth = await resolveCollectionAuth(
      await context.collectionManager.getCollectionAuth(args.collectionName),
      context.authManager,
    );
    if (collectionAuth) {
      injectAuthToMetadata(collectionAuth, metadata);
    }

    // 2. Request-level auth overrides collection auth
    if (req.authProfileId) {
      const reqAuth = await context.authManager.getProfile(req.authProfileId);
      if (reqAuth) injectAuthToMetadata(reqAuth, metadata);
    }

    // 3. Explicit headers override everything (merged last)
    if (req.headers) {
      Object.assign(metadata, req.headers);
    }

    const { runGrpcRequest } = await import('../../engine/grpc-runner.js');
    const protosDir = context.collectionManager.getBaseDir().replace(/\/[^/]+$/, '') + '/.reqly/protos';

    // Route to streaming handlers (T-168)
    if (grpcCfg.streaming) {
      return handleGrpcStreaming(grpcCfg, resolvedUrl, protosDir, metadata);
    }

    const result = await runGrpcRequest(
      {
        serverUrl: resolvedUrl,
        protoFile: grpcCfg.protoFile,
        service: grpcCfg.service,
        method: grpcCfg.method,
        message: grpcCfg.message ?? {},
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        insecure: grpcCfg.insecure !== false,
      },
      protosDir,
    );

    return { content: [{ type: 'text', text: JSON.stringify({ response: result }) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}


async function handleGrpcStreaming(
  grpcCfg: any,
  serverUrl: string,
  protosDir: string,
  metadata: Record<string, string>,
): Promise<ToolHandlerResult> {
  const streamReq = {
    serverUrl,
    protoFile: grpcCfg.protoFile,
    service: grpcCfg.service,
    method: grpcCfg.method,
    message: grpcCfg.message ?? {},
    messages: grpcCfg.messages ?? [],
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    insecure: grpcCfg.insecure !== false,
    streamTimeout: grpcCfg.streamTimeout,
  };

  try {
    const streaming = grpcCfg.streaming as string;
    if (streaming === 'server') {
      const { runGrpcServerStream } = await import('../../engine/grpc-streaming.js');
      const result = await runGrpcServerStream(streamReq, protosDir);
      return { content: [{ type: 'text', text: JSON.stringify({ response: result }) }] };
    } else if (streaming === 'client') {
      const { runGrpcClientStream } = await import('../../engine/grpc-streaming.js');
      const result = await runGrpcClientStream(streamReq, protosDir);
      return { content: [{ type: 'text', text: JSON.stringify({ response: result }) }] };
    } else if (streaming === 'bidirectional') {
      const { runGrpcBidiStream } = await import('../../engine/grpc-streaming.js');
      const result = await runGrpcBidiStream(streamReq, protosDir);
      return { content: [{ type: 'text', text: JSON.stringify({ response: result }) }] };
    }
    return { content: [{ type: 'text', text: `Unknown streaming mode: ${streaming}` }], isError: true };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}

function injectAuthToMetadata(auth: any, metadata: Record<string, string>) {
  const creds = auth.credentials ?? {};
  switch (String(auth.type).toLowerCase()) {
    case 'bearer':
      if (creds.token) metadata['authorization'] = `Bearer ${creds.token}`;
      break;
    case 'apikey': {
      // UI shape is { keyName, value }; legacy profiles use { key, value }.
      const headerName = creds.keyName || creds.key;
      if (headerName && creds.value) {
        // inject as lowercase header name
        metadata[headerName.toLowerCase()] = creds.value;
      }
      break;
    }
    case 'basic':
      if (creds.username && creds.password) {
        const encoded = Buffer.from(`${creds.username}:${creds.password}`).toString('base64');
        metadata['authorization'] = `Basic ${encoded}`;
      }
      break;
  }
}

