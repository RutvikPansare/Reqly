import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { Trash2, Square, Plus, X } from 'lucide-react';

const RECONNECT_MAX_DELAY = 5000;

interface TerminalSessionProps {
  active: boolean;
}

function TerminalSession({ active }: TerminalSessionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const [connected, setConnected] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      theme: {
        background: '#0a0a0a',
        foreground: '#d4d4d4',
        cursor: '#60a5fa',
        selectionBackground: 'rgba(96,165,250,0.25)',
        black: '#0a0a0a',
        red: '#f87171',
        green: '#4ade80',
        yellow: '#fbbf24',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#e5e5e5',
      },
      fontSize: 13,
      fontFamily: "'SF Mono', 'Menlo', 'Consolas', monospace",
      lineHeight: 1.4,
      cursorBlink: true,
      disableStdin: false,
      convertEol: false,
      scrollback: 5000,
    });
    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();
    termRef.current = term;

    const sendResize = () => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      sendResize();
    });
    resizeObserver.observe(containerRef.current);

    // Keystrokes go straight to the PTY - the shell itself echoes input and
    // renders its own prompt, so the terminal behaves like a real one.
    const dataSub = term.onData((data) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'input', data }));
    });

    let destroyed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/terminal`);
      wsRef.current = ws;

      ws.onopen = () => {
        const wasReconnect = attempt > 0;
        attempt = 0;
        setConnected(true);
        setRunning(true);
        if (wasReconnect) term.write('\r\n\x1b[32m[reconnected]\x1b[0m\r\n');
        sendResize();
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'data') {
          term.write(msg.data);
        } else if (msg.type === 'exit') {
          term.write(`\r\n\x1b[90m[shell exited${msg.signal ? ` (${msg.signal})` : ` with code ${msg.code}`}]\x1b[0m\r\n`);
          setRunning(false);
        } else if (msg.type === 'error') {
          term.write(`\r\n\x1b[31m[error] ${msg.message}\x1b[0m\r\n`);
        }
      };

      ws.onclose = () => {
        setConnected(false);
        setRunning(false);
        if (destroyed) return;
        attempt += 1;
        term.write('\r\n\x1b[33m[disconnected - reconnecting...]\x1b[0m\r\n');
        const delay = Math.min(RECONNECT_MAX_DELAY, 500 * attempt);
        reconnectTimer = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      destroyed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      resizeObserver.disconnect();
      dataSub.dispose();
      wsRef.current?.close();
      term.dispose();
    };
  }, []);

  useEffect(() => {
    if (active) {
      requestAnimationFrame(() => {
        fitAddonRef.current?.fit();
        termRef.current?.focus();
      });
    }
  }, [active]);

  const handleKill = () => {
    wsRef.current?.send(JSON.stringify({ type: 'kill' }));
  };

  const handleClear = () => {
    termRef.current?.clear();
  };

  return (
    <div className="flex flex-col h-full" style={{ background: '#0a0a0a', display: active ? 'flex' : 'none' }}>
      <div ref={containerRef} className="flex-1 overflow-hidden p-3 min-h-0" onClick={() => termRef.current?.focus()} />

      <div className="shrink-0 flex items-center px-3 gap-2" style={{ height: 32, borderTop: '1px solid var(--border)', background: 'var(--surface-1)' }}>
        <span
          className="shrink-0 rounded-full"
          style={{ width: 6, height: 6, background: connected ? '#4ade80' : '#f59e0b' }}
          title={connected ? 'Connected' : 'Reconnecting…'}
        />
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {connected ? 'bash/zsh - click terminal to type' : 'Reconnecting…'}
        </span>
        <div className="flex-1" />
        {running && (
          <button
            onClick={handleKill}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors"
            style={{ color: '#f87171', background: 'var(--surface-3)' }}
            title="Send Ctrl+C"
          >
            <Square size={12} /> Ctrl+C
          </button>
        )}
        <button
          onClick={handleClear}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors"
          style={{ color: 'var(--text-muted)' }}
          title="Clear terminal"
        >
          <Trash2 size={12} /> Clear
        </button>
      </div>
    </div>
  );
}

interface Session {
  id: number;
  name: string;
}

let _nextSessionId = 1;

export function TerminalSessionsPanel() {
  const [sessions, setSessions] = useState<Session[]>([{ id: _nextSessionId++, name: 'Terminal 1' }]);
  const [activeId, setActiveId] = useState<number>(sessions[0].id);

  const addSession = () => {
    const id = _nextSessionId++;
    setSessions(prev => [...prev, { id, name: `Terminal ${prev.length + 1}` }]);
    setActiveId(id);
  };

  const closeSession = (id: number) => {
    setSessions(prev => {
      const next = prev.filter(s => s.id !== id);
      if (next.length === 0) {
        const freshId = _nextSessionId++;
        const fresh = [{ id: freshId, name: 'Terminal 1' }];
        setActiveId(freshId);
        return fresh;
      }
      if (id === activeId) setActiveId(next[next.length - 1].id);
      return next;
    });
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 min-w-0" style={{ background: '#0a0a0a' }}>
      <div className="flex items-center shrink-0 px-2 gap-1" style={{ height: 34, borderBottom: '1px solid var(--border)', background: 'var(--surface-1)' }}>
        {sessions.map(s => (
          <div
            key={s.id}
            onClick={() => setActiveId(s.id)}
            className="flex items-center gap-1.5 cursor-pointer rounded-md transition-colors"
            style={{
              height: 26,
              padding: '0 6px 0 10px',
              fontSize: '11px',
              fontWeight: s.id === activeId ? 500 : 400,
              color: s.id === activeId ? 'var(--text-primary)' : 'var(--text-muted)',
              background: s.id === activeId ? 'var(--surface-0)' : 'transparent',
              border: s.id === activeId ? '1px solid var(--border)' : '1px solid transparent',
            }}
          >
            {s.name}
            <button
              onClick={e => { e.stopPropagation(); closeSession(s.id); }}
              className="flex items-center justify-center rounded-sm transition-colors"
              style={{ color: 'var(--text-muted)', width: 14, height: 14 }}
              title="Close session"
            >
              <X size={11} />
            </button>
          </div>
        ))}
        <button
          onClick={addSession}
          className="flex items-center justify-center rounded-md transition-colors"
          style={{ color: 'var(--text-muted)', width: 22, height: 22 }}
          title="New terminal session"
        >
          <Plus size={13} />
        </button>
      </div>

      <div className="flex-1 min-h-0">
        {sessions.map(s => (
          <TerminalSession key={s.id} active={s.id === activeId} />
        ))}
      </div>
    </div>
  );
}
