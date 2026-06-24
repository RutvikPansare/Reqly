import { useState, useEffect } from 'react';

export function CapturePanel({ onSelectCaptured }: { onSelectCaptured: (req: any) => void }) {
  const [active, setActive] = useState(false);
  const [requests, setRequests] = useState<any[]>([]);

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

  const clearCaptured = async () => {
    await fetch('/api/proxy/captured', { method: 'DELETE' });
    setRequests([]);
  };

  useEffect(() => {
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
  }, [active]);

  return (
    <div className="p-3 flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between shrink-0">
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Capture</h2>
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
                <span className={`text-[10px] font-bold ${
                  req.method === 'GET' ? 'text-green-400' :
                  req.method === 'POST' ? 'text-yellow-400' :
                  req.method === 'PUT' ? 'text-blue-400' :
                  req.method === 'DELETE' ? 'text-red-400' : 'text-gray-400'
                }`}>
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
    </div>
  );
}
