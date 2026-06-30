import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to test the subscription runner logic - specifically message buffering,
// timeout truncation, clean disconnect on 'complete', and error frame handling.
// We mock the graphql-ws createClient to control WS lifecycle.

vi.mock('graphql-ws', () => {
  return {
    createClient: vi.fn(),
  };
});

import { createClient } from 'graphql-ws';
import { runGraphQLSubscription } from './graphql-subscription-runner.js';

function makeStreamContext() {
  return {
    messages: [] as Array<{ data: unknown; timestamp: string }>,
    errors: [] as Array<string>,
  };
}

describe('graphql-subscription-runner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('buffers received messages and returns them on timeout', async () => {
    vi.mocked(createClient).mockImplementation((_opts: any) => ({
      subscribe: (_payload: any, sink: any) => {
        // Emit two messages then do nothing (no complete - forces timeout)
        sink.next({ data: { counter: 1 } });
        sink.next({ data: { counter: 2 } });
        return () => {};
      },
    }) as any);

    const result = await runGraphQLSubscription({
      url: 'ws://localhost:4000/graphql',
      query: 'subscription { counter }',
      streamTimeout: 0.05, // 50ms
    });

    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].data).toEqual({ counter: 1 });
    expect(result.messages[1].data).toEqual({ counter: 2 });
    expect(result.truncated).toBe(true);
  });

  it('returns truncated: false when server sends complete before timeout', async () => {
    vi.mocked(createClient).mockImplementation((_opts: any) => ({
      subscribe: (_payload: any, sink: any) => {
        sink.next({ data: { ping: 'pong' } });
        sink.complete();
        return () => {};
      },
    }) as any);

    const result = await runGraphQLSubscription({
      url: 'ws://localhost:4000/graphql',
      query: 'subscription { ping }',
      streamTimeout: 5,
    });

    expect(result.messages).toHaveLength(1);
    expect(result.truncated).toBe(false);
  });

  it('maps error frame to isError: true', async () => {
    vi.mocked(createClient).mockImplementation((_opts: any) => ({
      subscribe: (_payload: any, sink: any) => {
        sink.error(new Error('Subscription not found'));
        return () => {};
      },
    }) as any);

    const result = await runGraphQLSubscription({
      url: 'ws://localhost:4000/graphql',
      query: 'subscription { unknown }',
      streamTimeout: 5,
    });

    expect(result.isError).toBe(true);
    expect(result.errorMessage).toMatch(/Subscription not found/i);
  });

  it('each message has a timestamp string', async () => {
    vi.mocked(createClient).mockImplementation((_opts: any) => ({
      subscribe: (_payload: any, sink: any) => {
        sink.next({ data: { x: 1 } });
        sink.complete();
        return () => {};
      },
    }) as any);

    const result = await runGraphQLSubscription({
      url: 'ws://localhost:4000/graphql',
      query: 'subscription { x }',
      streamTimeout: 5,
    });

    expect(result.messages[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('forwards custom headers as connectionParams', async () => {
    let capturedParams: any;
    vi.mocked(createClient).mockImplementation((opts: any) => {
      capturedParams = typeof opts.connectionParams === 'function'
        ? opts.connectionParams()
        : opts.connectionParams;
      return {
        subscribe: (_p: any, sink: any) => { sink.complete(); return () => {}; },
      } as any;
    });

    await runGraphQLSubscription({
      url: 'ws://localhost:4000/graphql',
      query: 'subscription { x }',
      headers: { Authorization: 'Bearer tok' },
      streamTimeout: 5,
    });

    expect(capturedParams?.Authorization).toBe('Bearer tok');
  });
});
