import { useState, useEffect } from 'react';
import { METHOD_BADGE_BASE, methodBadgeClass } from '../lib/colors';

export function CapturePanel({ onSelectCaptured }: { onSelectCaptured: (req: any) => void }) {
  const [tab, setTab] = useState<'proxy'|'webhooks'>('proxy');
  const [active, setActive] = useState(false);
  const [requests, setRequests] = useState<any[]>([]);

  const [tunnelActive, setTunnelActive] = useState(false);
  const [tunnelUrl, setTunnelUrl] = useState('');

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

  return (
    <div className="p-3 flex flex-col gap-3 h-full">
      <div className="flex items-center gap-4 shrink-0 border-b border-gray-800 pb-2">
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
                  className="px-2 py-2 hover:bg-gray-800 cursor-pointer flex flex-col gap-1 border-b border-gray-800/50 rounded"
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
            <div className="text-xs text-blue-400 shrink-0 bg-gray-900 p-2 rounded border border-gray-800">
              <span className="text-gray-300 block mb-1">Send webhooks to:</span>
              <code className="block break-all font-mono select-all bg-gray-950 p-1.5 rounded">{tunnelUrl}/webhooks/your-path</code>
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
    </div>
  );
}
