import { createClient } from 'graphql-ws';

export interface SubscriptionMessage {
  data: unknown;
  timestamp: string;
}

export interface SubscriptionResult {
  messages: SubscriptionMessage[];
  truncated: boolean;
  isError?: boolean;
  errorMessage?: string;
}

export interface RunSubscriptionOptions {
  url: string;
  query: string;
  variables?: Record<string, unknown>;
  operationName?: string;
  headers?: Record<string, string>;
  /** Maximum seconds to buffer before returning. Default: 5. */
  streamTimeout?: number;
}

/**
 * Connects to a graphql-ws endpoint, buffers messages for up to streamTimeout
 * seconds, then disconnects and returns the collected messages.
 * Designed for agent use - the result is a plain object suitable for JSON
 * serialisation and return from an MCP tool.
 */
export function runGraphQLSubscription(options: RunSubscriptionOptions): Promise<SubscriptionResult> {
  const {
    url,
    query,
    variables,
    operationName,
    headers = {},
    streamTimeout = 5,
  } = options;

  return new Promise(resolve => {
    const messages: SubscriptionMessage[] = [];
    let settled = false;
    let unsubscribe: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (truncated: boolean) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try { unsubscribe?.(); } catch { /* ignore */ }
      resolve({ messages, truncated });
    };

    const client = createClient({
      url,
      connectionParams: Object.keys(headers).length > 0 ? headers : undefined,
      // One-shot: do not reconnect on error
      retryAttempts: 0,
      shouldRetry: () => false,
    });

    timer = setTimeout(() => finish(true), streamTimeout * 1000);

    unsubscribe = client.subscribe(
      { query, variables, operationName },
      {
        next(value) {
          messages.push({ data: value.data ?? null, timestamp: new Date().toISOString() });
        },
        error(err: any) {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);
          try { unsubscribe?.(); } catch { /* ignore */ }
          resolve({
            messages,
            truncated: false,
            isError: true,
            errorMessage: err?.message ?? String(err),
          });
        },
        complete() {
          finish(false);
        },
      }
    );
  });
}
