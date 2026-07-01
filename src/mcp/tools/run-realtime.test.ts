import { describe, it, expect, vi } from 'vitest';
import { definition, handler } from './run-realtime.js';

// ---------------------------------------------------------------------------
// run-realtime.test.ts  (T-187)
// ---------------------------------------------------------------------------

vi.mock('../../engine/realtime-executor.js', () => ({
  runRealtimeCapture: vi.fn(),
}));

import { runRealtimeCapture } from '../../engine/realtime-executor.js';

const mockContext: any = {};

describe('run_realtime - definition', () => {
  it('has correct tool name', () => {
    expect(definition.name).toBe('run_realtime');
  });

  it('description mentions all four protocol types', () => {
    expect(definition.description).toContain('websocket');
    expect(definition.description).toContain('sse');
    expect(definition.description).toContain('socketio');
    expect(definition.description).toContain('mqtt');
  });

  it('description mentions captureTimeout and sendMessages', () => {
    expect(definition.description).toContain('captureTimeout');
    expect(definition.description).toContain('sendMessages');
  });

  it('input schema requires type and url', () => {
    expect(definition.inputSchema.required).toContain('type');
    expect(definition.inputSchema.required).toContain('url');
  });

  it('type property is an enum with all four values', () => {
    const typeEnum = definition.inputSchema.properties.type.enum;
    expect(typeEnum).toContain('websocket');
    expect(typeEnum).toContain('sse');
    expect(typeEnum).toContain('socketio');
    expect(typeEnum).toContain('mqtt');
  });

  it('sendMessages items require message property', () => {
    const items = definition.inputSchema.properties.sendMessages.items;
    expect(items.required).toContain('message');
  });
});

describe('run_realtime - handler', () => {
  it('calls runRealtimeCapture with correct args and returns JSON result', async () => {
    const mockResult = {
      messages: [{ id: '1', ts: 1000, source: 'server', payload: 'hi' }],
      truncated: false,
    };
    vi.mocked(runRealtimeCapture).mockResolvedValueOnce(mockResult);

    const result = await handler(
      { type: 'websocket', url: 'ws://localhost:9999', captureTimeout: 3 },
      mockContext,
    );

    expect(runRealtimeCapture).toHaveBeenCalledWith(
      { type: 'websocket', url: 'ws://localhost:9999', config: {}, sendMessages: [] },
      { captureTimeout: 3 },
    );
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.messages).toHaveLength(1);
    expect(parsed.truncated).toBe(false);
  });

  it('defaults captureTimeout to 5 and sendMessages to []', async () => {
    vi.mocked(runRealtimeCapture).mockResolvedValueOnce({ messages: [], truncated: false });

    await handler({ type: 'sse', url: 'http://localhost/events' }, mockContext);

    expect(runRealtimeCapture).toHaveBeenCalledWith(
      expect.objectContaining({ sendMessages: [] }),
      { captureTimeout: 5 },
    );
  });

  it('passes config and sendMessages when provided', async () => {
    vi.mocked(runRealtimeCapture).mockResolvedValueOnce({ messages: [], truncated: false });

    await handler(
      {
        type: 'mqtt',
        url: 'mqtt://localhost:1883',
        config: { mqttTopics: [{ name: 'test', qos: 0 }] },
        sendMessages: [{ message: 'ON', topic: 'lights' }],
        captureTimeout: 10,
      },
      mockContext,
    );

    expect(runRealtimeCapture).toHaveBeenCalledWith(
      {
        type: 'mqtt',
        url: 'mqtt://localhost:1883',
        config: { mqttTopics: [{ name: 'test', qos: 0 }] },
        sendMessages: [{ message: 'ON', topic: 'lights' }],
      },
      { captureTimeout: 10 },
    );
  });

  it('returns isError result when runRealtimeCapture indicates error', async () => {
    vi.mocked(runRealtimeCapture).mockResolvedValueOnce({
      messages: [],
      truncated: false,
      isError: true,
      errorMessage: 'Connection refused',
    });

    const result = await handler(
      { type: 'websocket', url: 'ws://bad-host' },
      mockContext,
    );

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.errorMessage).toBe('Connection refused');
  });

  it('returns isError on unexpected throw', async () => {
    vi.mocked(runRealtimeCapture).mockRejectedValueOnce(new Error('unexpected'));

    const result = await handler({ type: 'websocket', url: 'ws://x' }, mockContext);

    expect(result.isError).toBe(true);
  });
});
