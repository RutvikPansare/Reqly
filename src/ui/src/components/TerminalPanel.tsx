import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { Trash2, Square } from 'lucide-react';

const HISTORY_LIMIT = 50;

export function TerminalPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef<number>(-1);

  const [command, setCommand] = useState('');
  const [running, setRunning] = useState(false);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      theme: { background: '#0f0f0f', foreground: '#e8e8e6' },
      fontSize: 13,
      cursorBlink: false,
      disableStdin: true,
      convertEol: true,
    });
    term.open(containerRef.current);
    termRef.current = term;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/terminal`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'stdout' || msg.type === 'stderr') {
        term.write(msg.data);
      } else if (msg.type === 'exit') {
        term.write(`\r\n\x1b[90m[exited with code ${msg.code}${msg.signal ? ` (${msg.signal})` : ''}]\x1b[0m\r\n`);
        setRunning(false);
      } else if (msg.type === 'error') {
        term.write(`\r\n\x1b[31m[error] ${msg.message}\x1b[0m\r\n`);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      setRunning(false);
      term.write('\r\n\x1b[33m[disconnected - reload to reconnect]\x1b[0m\r\n');
    };

    return () => {
      ws.close();
      term.dispose();
    };
  }, []);

  const runCommand = () => {
    const cmd = command.trim();
    if (!cmd || running || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    termRef.current?.write(`\x1b[36m$ ${cmd}\x1b[0m\r\n`);
    wsRef.current.send(JSON.stringify({ type: 'run', command: cmd }));
    setRunning(true);

    historyRef.current = [cmd, ...historyRef.current].slice(0, HISTORY_LIMIT);
    historyIndexRef.current = -1;
    setCommand('');
  };

  const handleKill = () => {
    wsRef.current?.send(JSON.stringify({ type: 'kill' }));
  };

  const handleClear = () => {
    termRef.current?.clear();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      runCommand();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.min(historyIndexRef.current + 1, historyRef.current.length - 1);
      if (next >= 0) {
        historyIndexRef.current = next;
        setCommand(historyRef.current[next]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = historyIndexRef.current - 1;
      historyIndexRef.current = next;
      setCommand(next >= 0 ? historyRef.current[next] : '');
    }
  };

  return (
    <div className="flex flex-col h-full" style={{ background: '#0f0f0f' }}>
      <div
        className="flex items-center justify-between shrink-0 px-3"
        style={{ height: 40, borderBottom: '1px solid var(--border)', background: 'var(--surface-1)' }}
      >
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
          Terminal{!connected && <span className="ml-2" style={{ color: '#f59e0b' }}>(disconnected)</span>}
        </span>
        <div className="flex items-center gap-2">
          {running && (
            <button
              onClick={handleKill}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors"
              style={{ color: '#f87171', background: 'var(--surface-3)' }}
              title="Kill running command"
            >
              <Square size={12} /> Kill
            </button>
          )}
          <button
            onClick={handleClear}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors"
            style={{ color: 'var(--text-muted)' }}
            title="Clear terminal"
          >
            <Trash2 size={12} /> Clear
          </button>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-hidden p-2" />

      <div className="shrink-0 flex items-center px-3 gap-2" style={{ height: 40, borderTop: '1px solid var(--border)', background: 'var(--surface-1)' }}>
        <span className="text-sm font-mono" style={{ color: 'var(--text-muted)' }}>$</span>
        <input
          autoFocus
          value={command}
          onChange={e => setCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={running || !connected}
          placeholder={running ? 'Running...' : 'Run a command...'}
          className="flex-1 bg-transparent outline-none text-sm font-mono"
          style={{ color: 'var(--text-primary)' }}
        />
      </div>
    </div>
  );
}
