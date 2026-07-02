import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';
import { runRealtimeCapture } from '../../engine/realtime-executor.js';

// ---------------------------------------------------------------------------
// run-realtime.ts  (T-187)
//
// MCP tool: run_realtime
// Connects to a realtime endpoint, buffers messages for captureTimeout
// seconds, then disconnects and returns all captured messages.
// ---------------------------------------------------------------------------

export const definition: ToolDefinition = {
  name: 'run_realtime',
  description:
    "Connects to a realtime endpoint (WebSocket, SSE, Socket.IO, or MQTT), captures messages for captureTimeout seconds, then disconnects and returns all received messages. Use this to verify a realtime endpoint works, test pub/sub flows, or capture a message sample. Returns { messages: [{ id, ts, source, payload, topic?, event? }], truncated, isError?, errorMessage? }. source values: 'server' = received from target, 'client' = sent by you, 'info' = connection events, 'error' = errors. Provide sendMessages to send messages after connecting (useful for WebSocket echo tests or MQTT publish). For types: 'websocket' expects ws:// or wss:// URLs; 'sse' expects http:// or https://; 'socketio' expects http:// or https://; 'mqtt' expects mqtt:// or ws:// URLs. captureTimeout defaults to 5 seconds. AWS SigV4 auth: pass awsAuth: { accessKey, secretKey, region, service, sessionToken? } to presign the WebSocket URL - the signature is applied as query parameters (X-Amz-Date, X-Amz-Algorithm, X-Amz-Credential, X-Amz-Signature). Use this for AWS AppSync realtime, IoT Core, and API Gateway WebSocket APIs.",
  inputSchema: {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['websocket', 'sse', 'socketio', 'mqtt'] },
      url: { type: 'string' },
      captureTimeout: { type: 'number', default: 5 },
      sendMessages: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            eventName: { type: 'string' },
            topic: { type: 'string' },
            retain: { type: 'boolean' },
          },
          required: ['message'],
        },
      },
      config: { type: 'object' },
      awsAuth: {
        type: 'object',
        description: 'AWS SigV4 credentials for presigning the WebSocket URL. Use for AWS AppSync realtime, IoT Core, API Gateway WebSocket APIs.',
        properties: {
          accessKey: { type: 'string', description: 'AWS Access Key ID' },
          secretKey: { type: 'string', description: 'AWS Secret Access Key' },
          region: { type: 'string', description: 'AWS region, e.g. us-east-1' },
          service: { type: 'string', description: 'AWS service name, e.g. appsync, execute-api, iotdevicegateway' },
          sessionToken: { type: 'string', description: 'Optional STS session token for temporary credentials' },
        },
        required: ['accessKey', 'secretKey', 'region', 'service'],
      },
    },
    required: ['type', 'url'],
  },
};

export async function handler(args: any, _context: EngineContext): Promise<ToolHandlerResult> {
  try {
    const result = await runRealtimeCapture(
      {
        type: args.type,
        url: args.url,
        config: args.config ?? {},
        sendMessages: args.sendMessages ?? [],
        awsAuth: args.awsAuth,
      },
      { captureTimeout: args.captureTimeout ?? 5 },
    );

    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
      isError: result.isError === true,
    };
  } catch (err: any) {
    return {
      content: [{ type: 'text', text: err?.message ?? String(err) }],
      isError: true,
    };
  }
}
