import { useRef, useState, useCallback, useEffect } from 'react';
import { Terminal, TerminalSquare, ChevronDown, Trash2 } from 'lucide-react';
import { TerminalSessionsPanel } from './TerminalPanel';

export type BottomTab = 'console' | 'terminal';

interface ConsoleEntry {
  id: number;
  level: 'log' | 'warn' | 'error' | 'info';
  message: string;
  source?: string; // e.g. "pre-script" | "post-script" | "system"
  timestamp: Date;
}

// Global console log store - entries are pushed here from ResponseViewer
let _entries: ConsoleEntry[] = [];
let _nextId = 1;
let _listeners: Array<() => void> = [];

export function pushConsoleLogs(logs: string[], source?: string) {
  for (const line of logs) {
    const level = line.startsWith('[error]') ? 'error'
      : line.startsWith('[warn]') ? 'warn'
      : 'log';
    _entries = [..._entries, { id: _nextId++, level, message: line, source, timestamp: new Date() }];
  }
  _listeners.forEach(fn => fn());
}

export function clearConsoleLogs() {
  _entries = [];
  _listeners.forEach(fn => fn());
}

function useConsoleEntries() {
  const [entries, setEntries] = useState<ConsoleEntry[]>(_entries);
  useEffect(() => {
    const sync = () => setEntries([..._entries]);
    _listeners.push(sync);
    return () => { _listeners = _listeners.filter(l => l !== sync); };
  }, []);
  return entries;
}

export function useConsoleStats() {
  const entries = useConsoleEntries();
  return { total: entries.length, errors: entries.filter(e => e.level === 'error').length };
}

interface BottomPanelProps {
  open: boolean;
  onClose: () => void;
  height: number;
  onHeightChange: (h: number) => void;
  activeTab: BottomTab;
  onTabChange: (tab: BottomTab) => void;
}

const MIN_HEIGHT = 120;
const MAX_HEIGHT = 600;

export function BottomPanel({ open, onClose, height, onHeightChange, activeTab }: BottomPanelProps) {
  const entries = useConsoleEntries();
  const listRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [entries, open]);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startH: height };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startY - ev.clientY;
      const newH = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, dragRef.current.startH + delta));
      onHeightChange(newH);
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [height, onHeightChange]);

  return (
    <div
      className="shrink-0 flex flex-col"
      style={{
        height: open ? height : 0,
        background: 'var(--surface-1)',
        overflow: 'hidden',
      }}
    >
      {/* Drag handle - thin line, brightens on hover/drag like the request/response divider */}
      <div
        onMouseDown={onDragStart}
        className="shrink-0 flex items-center justify-center cursor-row-resize group relative"
        style={{ height: '5px' }}
        title="Drag to resize"
      >
        <div
          className="absolute inset-x-0 top-1/2 -translate-y-1/2 transition-colors group-hover:bg-blue-500"
          style={{ height: '1px', background: 'var(--border)' }}
        />
      </div>

      {/* Console header - terminal's header+tabs merge into TerminalSessionsPanel's own row below to save space */}
      {activeTab === 'console' && (
        <div className="flex items-center shrink-0 px-3" style={{ height: '26px', borderBottom: '1px solid var(--border)', background: 'var(--surface-1)' }}>
          <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
            <Terminal size={12} />
            Console
          </span>

          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => clearConsoleLogs()}
              className="flex items-center gap-1 transition-colors rounded px-2"
              style={{ color: 'var(--text-muted)', fontSize: '0.7rem', height: '24px' }}
              title="Clear console"
            >
              <Trash2 size={11} />
            </button>
            <button
              onClick={onClose}
              className="flex items-center justify-center rounded transition-colors"
              style={{ color: 'var(--text-muted)', width: '24px', height: '24px' }}
              title="Close panel"
            >
              <ChevronDown size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Terminal content - stays mounted across tab switches and panel close so sessions persist */}
      <div className="flex-1 min-h-0" style={{ display: activeTab === 'terminal' ? 'flex' : 'none' }}>
        <TerminalSessionsPanel onClose={onClose} />
      </div>

      {/* Console content */}
      {activeTab === 'console' && (
        <div ref={listRef} className="flex-1 overflow-y-auto font-mono text-xs" style={{ background: 'var(--surface-1)' }}>
          {entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-1" style={{ color: 'var(--text-muted)' }}>
              <Terminal size={20} strokeWidth={1.2} opacity={0.3} />
              <p className="text-xs opacity-50 mt-1">No console output. Use <code>console.log()</code> in Pre/Post scripts.</p>
            </div>
          ) : (
            entries.map(entry => (
              <div
                key={entry.id}
                className="flex items-start gap-3 px-4 py-0.5 border-b"
                style={{
                  borderColor: 'rgba(255,255,255,0.03)',
                  color: entry.level === 'error' ? '#f87171' : entry.level === 'warn' ? '#fbbf24' : 'var(--text-secondary)',
                  background: entry.level === 'error' ? 'rgba(248,113,113,0.04)' : entry.level === 'warn' ? 'rgba(251,191,36,0.03)' : 'transparent',
                }}
              >
                <span className="shrink-0 mt-0.5" style={{ color: 'var(--text-muted)', fontSize: '0.65rem', width: '52px', textAlign: 'right' }}>
                  {entry.timestamp.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
                {entry.source && (
                  <span className="shrink-0 mt-0.5 px-1 rounded text-[10px]" style={{ background: 'var(--surface-3)', color: 'var(--text-muted)' }}>
                    {entry.source}
                  </span>
                )}
                <span className="flex-1 whitespace-pre-wrap break-all">{entry.message.replace(/^\[(log|warn|error|info)\] /, '')}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// Bottom status bar - always visible
interface BottomBarProps {
  consoleOpen: boolean;
  activeTab: BottomTab;
  onSelectTab: (tab: BottomTab) => void;
  entryCount: number;
  errorCount: number;
}

export function BottomBar({ consoleOpen, activeTab, onSelectTab, entryCount, errorCount }: BottomBarProps) {
  const isConsoleActive = consoleOpen && activeTab === 'console';
  const isTerminalActive = consoleOpen && activeTab === 'terminal';

  return (
    <div
      className="shrink-0 flex items-center px-3 gap-2"
      style={{ height: '26px', background: 'var(--surface-1)', borderTop: '1px solid var(--border)', zIndex: 10 }}
    >
      <button
        onClick={() => onSelectTab('console')}
        className="flex items-center gap-1.5 rounded transition-colors px-2"
        style={{
          height: '20px',
          fontSize: '0.7rem',
          color: isConsoleActive ? '#fbbf24' : 'var(--text-muted)',
          background: isConsoleActive ? 'rgba(251,191,36,0.08)' : 'transparent',
          border: isConsoleActive ? '1px solid rgba(251,191,36,0.2)' : '1px solid transparent',
        }}
        title="Toggle Console (Ctrl+`)"
      >
        <Terminal size={11} />
        Console
        {errorCount > 0 && (
          <span className="ml-0.5 text-[9px] font-bold px-1 rounded" style={{ background: 'rgba(248,113,113,0.18)', color: '#f87171' }}>
            {errorCount}
          </span>
        )}
        {entryCount > 0 && errorCount === 0 && (
          <span className="ml-0.5 text-[9px] font-bold px-1 rounded" style={{ background: 'var(--surface-3)', color: 'var(--text-muted)' }}>
            {entryCount}
          </span>
        )}
      </button>

      <button
        onClick={() => onSelectTab('terminal')}
        className="flex items-center gap-1.5 rounded transition-colors px-2"
        style={{
          height: '20px',
          fontSize: '0.7rem',
          color: isTerminalActive ? '#fbbf24' : 'var(--text-muted)',
          background: isTerminalActive ? 'rgba(251,191,36,0.08)' : 'transparent',
          border: isTerminalActive ? '1px solid rgba(251,191,36,0.2)' : '1px solid transparent',
        }}
        title="Toggle Terminal"
      >
        <TerminalSquare size={11} />
        Terminal
      </button>
    </div>
  );
}
