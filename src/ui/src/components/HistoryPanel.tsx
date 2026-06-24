import { useEffect, useState } from 'react';
import { fetchHistory, clearHistory } from '../api';
import type { HistoryEntry } from '../api';

interface HistoryPanelProps {
  onSelectRequest: (req: any, collectionName: string) => void;
}

function statusColor(status: number): string {
  if (status >= 200 && status < 300) return 'text-green-500';
  if (status >= 400 && status < 500) return 'text-yellow-500';
  if (status >= 500) return 'text-red-500';
  return 'text-gray-400';
}

function methodColor(method: string): string {
  switch (method) {
    case 'GET': return 'text-green-500';
    case 'POST': return 'text-yellow-500';
    case 'PUT': return 'text-blue-500';
    case 'PATCH': return 'text-orange-500';
    case 'DELETE': return 'text-red-500';
    default: return 'text-gray-500';
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  const ss = d.getSeconds().toString().padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function HistoryPanel({ onSelectRequest }: HistoryPanelProps) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  const loadData = () => {
    fetchHistory().then(setEntries).catch(console.error);
  };

  useEffect(() => {
    loadData();
    window.addEventListener('reqly-reload', loadData);
    return () => window.removeEventListener('reqly-reload', loadData);
  }, []);

  const handleClear = async () => {
    await clearHistory();
    loadData();
  };

  const handleClick = (entry: HistoryEntry) => {
    onSelectRequest(
      { name: entry.requestName || 'Untitled', method: entry.method, url: entry.url },
      entry.collectionName || ''
    );
  };

  return (
    <div className="p-3 flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between shrink-0">
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest">History</h2>
        {entries.length > 0 && (
          <button
            onClick={handleClear}
            className="text-xs text-red-400 hover:text-red-300 px-2 py-0.5 rounded hover:bg-gray-800 transition-colors"
            title="Clear history"
          >
            Clear
          </button>
        )}
      </div>

      <div className="space-y-0.5 overflow-y-auto flex-1">
        {entries.length === 0 && (
          <p className="text-xs text-gray-600 italic px-1">No requests fired yet</p>
        )}
        {entries.map(entry => (
          <div
            key={entry.id}
            onClick={() => handleClick(entry)}
            className="px-2 py-1.5 rounded cursor-pointer hover:bg-gray-800/50 flex items-center gap-2 group"
          >
            <span className={`text-[10px] font-bold w-12 shrink-0 ${methodColor(entry.method)}`}>
              {entry.method}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-gray-300 truncate">{entry.url}</div>
              <div className="text-[10px] text-gray-600 flex items-center gap-2">
                <span>{formatTime(entry.timestamp)}</span>
                {entry.requestName && <span className="truncate">{entry.requestName}</span>}
              </div>
            </div>
            <div className="flex flex-col items-end shrink-0">
              <span className={`text-xs font-bold ${statusColor(entry.status)}`}>{entry.status}</span>
              <span className="text-[10px] text-gray-600">{entry.latency}ms</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
