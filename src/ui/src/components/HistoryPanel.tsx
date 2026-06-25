import { useEffect, useState } from 'react';
import { fetchHistory, clearHistory } from '../api';
import type { HistoryEntry } from '../api';
import { METHOD_BADGE_BASE, methodBadgeClass, statusColorClass } from '../lib/colors';

interface HistoryPanelProps {
  onSelectRequest: (req: any, collectionName: string) => void;
}

const statusColor = statusColorClass;

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
        <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>History</h2>
        {entries.length > 0 && (
          <button
            onClick={handleClear}
            className="text-xs text-red-400 hover:text-red-300 px-2 py-0.5 rounded transition-colors"
            title="Clear history"
          >
            Clear
          </button>
        )}
      </div>

      <div className="space-y-0.5 overflow-y-auto flex-1">
        {entries.length === 0 && (
          <p className="text-xs italic px-1" style={{ color: 'var(--text-muted)' }}>No requests fired yet</p>
        )}
        {entries.map(entry => (
          <div
            key={entry.id}
            onClick={() => handleClick(entry)}
            className="px-2 py-1.5 rounded cursor-pointer flex items-center gap-2 group transition-colors"
            style={{ background: 'transparent' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <span className={`${METHOD_BADGE_BASE} ${methodBadgeClass(entry.method)} shrink-0`}>
              {entry.method}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>{entry.url}</div>
              <div className="text-[10px] flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
                <span>{formatTime(entry.timestamp)}</span>
                {entry.requestName && <span className="truncate">{entry.requestName}</span>}
              </div>
            </div>
            <div className="flex flex-col items-end shrink-0">
              <span className={`text-xs font-bold ${statusColor(entry.status)}`}>{entry.status}</span>
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{entry.latency}ms</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
