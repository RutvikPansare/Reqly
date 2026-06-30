import { useState, useRef, useEffect } from 'react';
import { Loader2, Play, StopCircle, Trash2 } from 'lucide-react';
import { createClient } from 'graphql-ws';
import type { Client } from 'graphql-ws';

interface StreamMessage {
  data: unknown;
  timestamp: string;
  type: 'received' | 'error' | 'complete';
}

interface Props {
  url: string;
  query: string;
  variables?: string;
  operationName?: string;
  headers?: Record<string, string>;
}

function formatTime(iso: string): string {
  try { return new Date(iso).toLocaleTimeString(); } catch { return iso; }
}

export function GraphQLSubscriptionStream({ url, query, variables, operationName, headers = {} }: Props) {
  const [messages, setMessages] = useState<StreamMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<Client | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleConnect = () => {
    if (connected || connecting) return;
    setError(null);
    setConnecting(true);

    let vars: Record<string, unknown> | undefined;
    if (variables?.trim()) {
      try { vars = JSON.parse(variables); } catch { setError('Invalid JSON in variables'); setConnecting(false); return; }
    }

    const client = createClient({
      url: url.replace(/^http/, 'ws'), // normalise http(s) -> ws(s)
      connectionParams: Object.keys(headers).length > 0 ? headers : undefined,
      retryAttempts: 0,
      shouldRetry: () => false,
    });
    clientRef.current = client;

    const unsub = client.subscribe(
      { query, variables: vars, operationName: operationName ?? undefined },
      {
        next(value) {
          setConnected(true);
          setConnecting(false);
          setMessages(prev => [...prev, {
            data: value.data ?? null,
            timestamp: new Date().toISOString(),
            type: 'received',
          }]);
        },
        error(err: any) {
          setConnecting(false);
          setConnected(false);
          setError(err?.message ?? String(err));
          setMessages(prev => [...prev, {
            data: null,
            timestamp: new Date().toISOString(),
            type: 'error',
          }]);
        },
        complete() {
          setConnected(false);
          setConnecting(false);
          setMessages(prev => [...prev, {
            data: null,
            timestamp: new Date().toISOString(),
            type: 'complete',
          }]);
        },
      }
    );
    unsubscribeRef.current = unsub;
    // Mark connected once subscription is set up (before first message)
    setConnected(true);
    setConnecting(false);
  };

  const handleDisconnect = () => {
    try { unsubscribeRef.current?.(); } catch { /* ignore */ }
    clientRef.current = null;
    setConnected(false);
    setConnecting(false);
  };

  // Clean up on unmount
  useEffect(() => () => { try { unsubscribeRef.current?.(); } catch { /* ignore */ } }, []);

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--surface-1)' }}>
      {/* Control bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)] shrink-0" style={{ background: 'var(--surface-2)' }}>
        {!connected && !connecting ? (
          <button
            onClick={handleConnect}
            className="flex items-center gap-1.5 bg-green-700 hover:bg-green-600 text-white px-3 py-1 rounded text-xs font-semibold transition-colors"
          >
            <Play size={12} /> Connect
          </button>
        ) : connecting ? (
          <button disabled className="flex items-center gap-1.5 bg-gray-700 text-gray-400 px-3 py-1 rounded text-xs font-semibold">
            <Loader2 size={12} className="animate-spin" /> Connecting...
          </button>
        ) : (
          <button
            onClick={handleDisconnect}
            className="flex items-center gap-1.5 bg-red-800 hover:bg-red-700 text-white px-3 py-1 rounded text-xs font-semibold transition-colors"
          >
            <StopCircle size={12} /> Disconnect
          </button>
        )}
        <span className={`text-[10px] font-semibold ${connected ? 'text-green-400' : 'text-gray-600'}`}>
          {connected ? 'Connected' : 'Disconnected'}
        </span>
        <span className="ml-auto text-[10px] text-gray-600">{messages.filter(m => m.type === 'received').length} messages</span>
        <button
          onClick={() => setMessages([])}
          className="text-gray-600 hover:text-gray-300 transition-colors"
          title="Clear stream"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* Stream log */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1 font-mono text-xs">
        {error && (
          <div className="text-red-400 px-2 py-1 border border-red-800 rounded bg-red-950">{error}</div>
        )}
        {messages.length === 0 && !error && (
          <div className="text-gray-600 text-center py-6">No messages yet. Connect and send a subscription to start streaming.</div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex items-start gap-2 px-2 py-1 rounded ${
            m.type === 'error' ? 'bg-red-950 text-red-300' :
            m.type === 'complete' ? 'bg-[var(--surface-2)] text-gray-500' :
            'bg-[var(--surface-2)] text-gray-200'
          }`}>
            <span className="text-gray-600 shrink-0">{formatTime(m.timestamp)}</span>
            <span className={`shrink-0 w-16 font-semibold ${
              m.type === 'error' ? 'text-red-400' :
              m.type === 'complete' ? 'text-gray-500' :
              'text-green-400'
            }`}>
              {m.type === 'received' ? '← recv' : m.type === 'error' ? '! error' : '✓ done'}
            </span>
            {m.type === 'received' && m.data !== null && (
              <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                {JSON.stringify(m.data)}
              </span>
            )}
            {m.type === 'complete' && (
              <span className="text-gray-500">Stream completed</span>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
