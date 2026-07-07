import { useState, useEffect, useRef } from 'react';
import { METHOD_BADGE_BASE, methodBadgeClass } from '../lib/colors';
import { fetchCollections } from '../api';

interface MockRoute {
  method: string;
  path: string;
  exampleCount: number;
}

interface MockStatus {
  running: boolean;
  collection?: string;
  port?: number;
  routes: MockRoute[];
}

async function fetchMockStatus(): Promise<MockStatus> {
  const res = await fetch('/api/mock/status');
  return res.json();
}

export function CapturePanel({ onSelectCaptured, onOpenCollection }: {
  onSelectCaptured: (req: any) => void;
  onOpenCollection?: (collection: string) => void;
}) {
  const [tab, setTab] = useState<'proxy' | 'webhooks' | 'mock'>('proxy');
  const [active, setActive] = useState(false);
  const [requests, setRequests] = useState<any[]>([]);

  const [tunnelActive, setTunnelActive] = useState(false);
  const [tunnelUrl, setTunnelUrl] = useState('');

  // Mock server state
  const [mockStatus, setMockStatus] = useState<MockStatus>({ running: false, routes: [] });
  const [mockCollection, setMockCollection] = useState('');
  const [mockPort, setMockPort] = useState('4243');
  const [mockLoading, setMockLoading] = useState(false);
  const [collections, setCollections] = useState<string[]>([]);
  const mockPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const toggleProxy = async () => {
    if (active) {
      await fetch('/api/proxy/stop', { method: 'POST' });
      setActive(false);
    } else {
      await fetch('/api/proxy/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ port: 7474, collectionName: 'captured' })
      });
      setActive(true);
    }
  };

  const toggleTunnel = async () => {
    if (tunnelActive) {
      await fetch('/api/tunnel/stop', { method: 'POST' });
      setTunnelActive(false);
      setTunnelUrl('');
    } else {
      try {
        const res = await fetch('/api/tunnel/start', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          setTunnelActive(true);
          setTunnelUrl(data.url);
        }
      } catch (e) {
        console.error(e);
      }
    }
  };

  const clearCaptured = async () => {
    await fetch('/api/proxy/captured', { method: 'DELETE' });
    setRequests([]);
  };

  useEffect(() => {
    fetch('/api/tunnel/status')
      .then(res => res.json())
      .then(data => {
        setTunnelActive(data.active);
        setTunnelUrl(data.url || '');
      });
  }, []);

  useEffect(() => {
    if (tab !== 'proxy') return;
    if (!active) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/proxy/captured');
        if (res.ok) {
          const data = await res.json();
          setRequests(data);
        }
      } catch (e) {}
    }, 2000);
    return () => clearInterval(interval);
  }, [active, tab]);

  // Load collection list when Mock tab is opened
  useEffect(() => {
    if (tab !== 'mock') return;
    fetchCollections().then((data: any) => {
      // /api/collections returns a bare array of collections, not { collections }.
      const list = Array.isArray(data) ? data : (data.collections || []);
      const names: string[] = list.map((c: any) => c.name || c);
      setCollections(names);
      if (!mockCollection && names.length > 0) setMockCollection(names[0]);
    }).catch(() => {});
  }, [tab]);

  // Poll mock status every 3s while Mock tab is visible
  useEffect(() => {
    if (tab !== 'mock') {
      if (mockPollRef.current) { clearInterval(mockPollRef.current); mockPollRef.current = null; }
      return;
    }
    const poll = async () => {
      try { setMockStatus(await fetchMockStatus()); } catch {}
    };
    poll();
    mockPollRef.current = setInterval(poll, 3000);
    return () => { if (mockPollRef.current) clearInterval(mockPollRef.current); };
  }, [tab]);

  const startMock = async () => {
    if (!mockCollection) return;
    setMockLoading(true);
    try {
      await fetch('/api/mock/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collection: mockCollection, port: Number(mockPort) || 4243 }),
      });
      setMockStatus(await fetchMockStatus());
    } catch (e) { console.error(e); }
    setMockLoading(false);
  };

  const stopMock = async () => {
    setMockLoading(true);
    try {
      await fetch('/api/mock/stop', { method: 'POST' });
      setMockStatus(await fetchMockStatus());
    } catch (e) { console.error(e); }
    setMockLoading(false);
  };

  return (
    <div className="p-3 flex flex-col gap-3 h-full">
      <div className="flex items-center gap-4 shrink-0 border-b border-[var(--border)] pb-2">
        <button 
          onClick={() => setTab('proxy')}
          className={`text-xs font-bold uppercase tracking-widest ${tab === 'proxy' ? 'text-blue-400' : 'text-gray-500 hover:text-gray-300'}`}
        >
          Outbound
        </button>
        <button 
          onClick={() => setTab('webhooks')}
          className={`text-xs font-bold uppercase tracking-widest ${tab === 'webhooks' ? 'text-blue-400' : 'text-gray-500 hover:text-gray-300'}`}
        >
          Webhooks
        </button>
        <button
          onClick={() => setTab('mock')}
          className={`text-xs font-bold uppercase tracking-widest ${tab === 'mock' ? 'text-blue-400' : 'text-gray-500 hover:text-gray-300'}`}
        >
          Mock
        </button>
      </div>

      {tab === 'proxy' && (
        <>
          <div className="flex items-center justify-between shrink-0">
            <span className="text-xs font-medium text-gray-300">Proxy Capture</span>
            <button
              onClick={toggleProxy}
              title={active ? 'Stop proxy' : 'Start proxy'}
              className={`w-9 h-5 rounded-full relative transition-colors ${active ? 'bg-blue-600' : 'bg-gray-700'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${active ? 'left-[18px]' : 'left-0.5'}`} />
            </button>
          </div>

          {active && (
            <div className="text-xs text-blue-400 shrink-0">
              Listening on port 7474...
              <br />
              <span className="text-gray-500">Set your app's HTTP proxy to localhost:7474</span>
            </div>
          )}

          {requests.length > 0 && (
            <div className="flex justify-end shrink-0">
              <button onClick={clearCaptured} className="text-xs text-gray-500 hover:text-white">Clear</button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {requests.length === 0 && !active && (
              <p className="text-xs text-gray-600 italic px-1">Start the proxy to capture traffic.</p>
            )}
            {requests.map((req, i) => {
              let path = req.url;
              try { path = new URL(req.url).pathname; } catch {}
              return (
                <div
                  key={i}
                  className="px-2 py-2 hover:bg-[var(--surface-3)] cursor-pointer flex flex-col gap-1 border-b border-[var(--border)]/50 rounded"
                  onClick={() => onSelectCaptured(req)}
                >
                  <div className="flex items-center gap-2">
                    <span className={`${METHOD_BADGE_BASE} ${methodBadgeClass(req.method)}`}>
                      {req.method}
                    </span>
                    <span className="text-xs text-gray-300 truncate" title={req.url}>
                      {path}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {tab === 'webhooks' && (
        <>
          <div className="flex items-center justify-between shrink-0">
            <span className="text-xs font-medium text-gray-300">Public Webhook URL</span>
            <button
              onClick={toggleTunnel}
              title={tunnelActive ? 'Stop tunnel' : 'Start tunnel'}
              className={`w-9 h-5 rounded-full relative transition-colors ${tunnelActive ? 'bg-blue-600' : 'bg-gray-700'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${tunnelActive ? 'left-[18px]' : 'left-0.5'}`} />
            </button>
          </div>

          {tunnelActive ? (
            <div className="text-xs text-blue-400 shrink-0 bg-[var(--surface-1)] p-2 rounded border border-[var(--border)]">
              <span className="text-gray-300 block mb-1">Send webhooks to:</span>
              <code className="block break-all font-mono select-all bg-[var(--surface-1)] p-1.5 rounded">{tunnelUrl}/webhooks/your-path</code>
            </div>
          ) : (
            <p className="text-xs text-gray-500 shrink-0">
              Start the tunnel to get a public URL for external services (Stripe, Shopify) to send webhooks to your local machine.
            </p>
          )}

          <div className="flex-1 overflow-y-auto">
            <p className="text-xs text-gray-600 italic px-1 mt-2">
              Captured webhooks will appear in your sidebar under the <strong>Webhooks</strong> collection automatically.
            </p>
          </div>
        </>
      )}

      {tab === 'mock' && (
        <>
          {!mockStatus.running ? (
            /* Stopped state: collection picker + port + start button */
            <div className="flex flex-col gap-3 shrink-0">
              <div className="flex flex-col gap-1">
                <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Collection</label>
                <select
                  value={mockCollection}
                  onChange={e => setMockCollection(e.target.value)}
                  className="text-xs rounded px-2 py-1.5 outline-none"
                  style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                >
                  {collections.length === 0 && <option value="">No collections</option>}
                  {collections.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Port</label>
                <input
                  type="number"
                  value={mockPort}
                  onChange={e => setMockPort(e.target.value)}
                  className="text-xs rounded px-2 py-1.5 outline-none w-full"
                  style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                />
              </div>
              <button
                onClick={startMock}
                disabled={!mockCollection || mockLoading}
                className="w-full text-xs font-semibold rounded py-1.5 transition-colors disabled:opacity-40"
                style={{ background: '#6366f1', color: '#fff' }}
              >
                {mockLoading ? 'Starting...' : 'Start mock'}
              </button>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Serves saved example responses. Add examples to requests in a collection first, then start the mock.
              </p>
            </div>
          ) : (
            /* Running state: status + route table + stop button */
            <>
              <div className="flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                    Running on :{mockStatus.port}
                  </span>
                </div>
                <button
                  onClick={stopMock}
                  disabled={mockLoading}
                  className="text-xs px-2.5 py-1 rounded transition-colors disabled:opacity-40 hover:bg-red-900/40"
                  style={{ color: '#f87171', border: '1px solid rgba(248,113,113,0.3)' }}
                >
                  {mockLoading ? 'Stopping...' : 'Stop'}
                </button>
              </div>

              <div className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>
                Collection: <span style={{ color: 'var(--text-primary)' }}>{mockStatus.collection}</span>
              </div>

              <div className="flex-1 overflow-y-auto">
                {mockStatus.routes.length === 0 ? (
                  <p className="text-xs italic px-1" style={{ color: 'var(--text-muted)' }}>
                    No routes - add saved examples to requests in this collection.
                  </p>
                ) : (
                  <div
                    className="rounded overflow-hidden text-xs"
                    style={{ border: '1px solid var(--border)' }}
                  >
                    {/* Header */}
                    <div
                      className="grid px-2 py-1.5 font-semibold uppercase tracking-wider text-[10px]"
                      style={{
                        gridTemplateColumns: '64px 1fr 40px',
                        background: 'var(--surface-1)',
                        borderBottom: '1px solid var(--border)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      <span>Method</span>
                      <span>Path</span>
                      <span className="text-right">Ex</span>
                    </div>
                    {mockStatus.routes.map((route, i) => (
                      <div
                        key={i}
                        className="grid px-2 py-1.5 items-center cursor-pointer hover:bg-white/5 transition-colors"
                        style={{
                          gridTemplateColumns: '64px 1fr 40px',
                          borderBottom: i < mockStatus.routes.length - 1 ? '1px solid var(--border)' : undefined,
                        }}
                        onClick={() => onOpenCollection?.(mockStatus.collection!)}
                        title="Open collection to add/edit examples"
                      >
                        <span className={`${METHOD_BADGE_BASE} ${methodBadgeClass(route.method)}`}>
                          {route.method}
                        </span>
                        <span className="font-mono truncate" style={{ color: 'var(--text-primary)' }} title={route.path}>
                          {route.path}
                        </span>
                        <span className="text-right" style={{ color: 'var(--text-muted)' }}>
                          {route.exampleCount}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
