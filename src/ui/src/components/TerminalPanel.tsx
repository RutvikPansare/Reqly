import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { Plus, X, TerminalSquare, ChevronDown } from 'lucide-react';

const RECONNECT_MAX_DELAY = 5000;

// --- localStorage persistence -----------------------------------------------

interface PersistedSession { id: number; name: string; uuid: string; }

function loadPersistedSessions(): PersistedSession[] {
  try {
    const raw = localStorage.getItem('reqly-terminal-sessions');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* ignore corrupt storage */ }
  return [];
}

function savePersistedSessions(s: PersistedSession[]) {
  try { localStorage.setItem('reqly-terminal-sessions', JSON.stringify(s)); } catch {}
}

function newUuid(): string {
  return crypto.randomUUID();
}

// --- TerminalSession ---------------------------------------------------------

interface TerminalSessionProps {
  active: boolean;
  sessionUuid: string;
}

function TerminalSession({ active, sessionUuid }: TerminalSessionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef      = useRef<XTerm | null>(null);
  const fitAddonRef  = useRef<FitAddon | null>(null);
  const wsRef        = useRef<WebSocket | null>(null);
  // Track whether we've already replayed the scrollback buffer for this mount.
  // Resets to false on every component mount (i.e. browser refresh), so a
  // fresh mount always replays whatever the server has buffered.
  const hasReplayedRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      theme: {
        background: '#0a0a0a',
        foreground: '#d4d4d4',
        cursor: '#60a5fa',
        selectionBackground: 'rgba(96,165,250,0.25)',
        black: '#0a0a0a', red: '#f87171', green: '#4ade80', yellow: '#fbbf24',
        blue: '#60a5fa', magenta: '#c084fc', cyan: '#22d3ee', white: '#e5e5e5',
      },
      fontSize: 13,
      fontFamily: "'SF Mono', 'Menlo', 'Consolas', monospace",
      lineHeight: 1.25,
      cursorBlink: true,
      disableStdin: false,
      convertEol: false,
      scrollback: 5000,
      smoothScrollDuration: 150,
    });
    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();
    termRef.current = term;

    const sendResize = () => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
    };

    const resizeObserver = new ResizeObserver(() => { fitAddon.fit(); sendResize(); });
    resizeObserver.observe(containerRef.current);

    const dataSub = term.onData((data) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: 'input', data }));
    });

    let destroyed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/terminal`);
      wsRef.current = ws;

      ws.onopen = () => {
        // Handshake: tell the server which session to attach to.
        ws.send(JSON.stringify({
          type: 'attach',
          sessionId: sessionUuid,
          cols: term.cols,
          rows: term.rows,
        }));
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);

        if (msg.type === 'ready') {
          const wasReconnect = attempt > 0;
          attempt = 0;

          if (msg.isNew) {
            // Server spawned a fresh PTY (first connect, or server restarted).
            if (hasReplayedRef.current) {
              // Server restarted - old session is gone.
              term.write('\r\n\x1b[33m[server restarted - new shell session]\x1b[0m\r\n');
            }
            // else: brand new session, shell will print its own prompt naturally.
          } else {
            // Existing session re-attached.
            if (!hasReplayedRef.current && msg.replay) {
              term.reset();
              // Strip zsh's PROMPT_SP sequence from the replay buffer start.
              // PROMPT_SP = '%' + spaces + '\r' - renders as an invisible line
              // fill on a live terminal but leaves a stray '%' when replayed
              // into a fresh xterm at position 0,0.
              const cleaned = msg.replay.replace(/^%[^\r]*\r/, '');
              term.write(cleaned);
            } else if (wasReconnect) {
              term.write('\r\n\x1b[32m[reconnected]\x1b[0m\r\n');
            }
          }
          hasReplayedRef.current = true;
          sendResize();
          return;
        }

        if (msg.type === 'data')  { term.write(msg.data); }
        else if (msg.type === 'exit') {
          term.write(`\r\n\x1b[90m[shell exited${msg.signal ? ` (${msg.signal})` : ` with code ${msg.code}`}]\x1b[0m\r\n`);
        } else if (msg.type === 'error') {
          term.write(`\r\n\x1b[31m[error] ${msg.message}\x1b[0m\r\n`);
        }
      };

      ws.onclose = () => {
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
  }, [sessionUuid]);

  useEffect(() => {
    if (active) {
      requestAnimationFrame(() => {
        fitAddonRef.current?.fit();
        termRef.current?.focus();
      });
    }
  }, [active]);

  return (
    <div className="flex flex-col h-full" style={{ background: '#0a0a0a', display: active ? 'flex' : 'none' }}>
      <div ref={containerRef} className="flex-1 overflow-hidden min-h-0" onClick={() => termRef.current?.focus()} />
    </div>
  );
}

// --- TerminalSessionsPanel ---------------------------------------------------

interface Session { id: number; name: string; uuid: string; }

let _nextSessionId = 1;

function makeSession(name: string): Session {
  return { id: _nextSessionId++, name, uuid: newUuid() };
}

export function TerminalSessionsPanel({ onClose }: { onClose?: () => void }) {
  const [sessions, setSessions] = useState<Session[]>(() => {
    const persisted = loadPersistedSessions();
    if (persisted.length > 0) {
      // Restore IDs to avoid collisions with new sessions created later.
      const maxId = Math.max(...persisted.map(s => s.id));
      _nextSessionId = maxId + 1;
      return persisted;
    }
    return [makeSession('Terminal 1')];
  });
  const [activeId, setActiveId] = useState<number>(sessions[0].id);

  // Persist whenever sessions change.
  useEffect(() => { savePersistedSessions(sessions); }, [sessions]);

  const addSession = () => {
    const s = makeSession(`Terminal ${sessions.length + 1}`);
    setSessions(prev => [...prev, s]);
    setActiveId(s.id);
  };

  const closeSession = (id: number) => {
    setSessions(prev => {
      const next = prev.filter(s => s.id !== id);
      if (next.length === 0) {
        const fresh = makeSession('Terminal 1');
        setActiveId(fresh.id);
        return [fresh];
      }
      if (id === activeId) setActiveId(next[next.length - 1].id);
      return next;
    });
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 min-w-0" style={{ background: '#0a0a0a' }}>
      {/* Merged header + tab bar - one compact row, flush tabs with faint dividers */}
      <div className="flex items-center shrink-0 px-3 gap-1" style={{ height: 26, borderBottom: '1px solid var(--border)', background: 'var(--surface-1)' }}>
        <span className="flex items-center gap-1.5 text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>
          <TerminalSquare size={12} />
          Terminal
        </span>
        <div className="w-px self-stretch my-1.5 mx-1.5 shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }} />
        {sessions.map(s => (
          <div
            key={s.id}
            onClick={() => setActiveId(s.id)}
            className="relative flex items-center gap-1.5 cursor-pointer h-full shrink-0"
            style={{
              padding: '0 8px',
              fontSize: '11px',
              fontWeight: s.id === activeId ? 500 : 400,
              color: s.id === activeId ? 'var(--text-primary)' : 'var(--text-muted)',
              borderRight: '1px solid rgba(255,255,255,0.03)',
            }}
          >
            {s.id === activeId && (
              <span className="absolute left-0 bottom-0 right-0 h-0.5 bg-blue-500" aria-hidden="true" />
            )}
            {s.name}
            <button
              onClick={e => { e.stopPropagation(); closeSession(s.id); }}
              className="flex items-center justify-center rounded-sm transition-colors"
              style={{ color: 'var(--text-muted)', width: 12, height: 12 }}
              title="Close session"
            >
              <X size={10} />
            </button>
          </div>
        ))}
        <button
          onClick={addSession}
          className="flex items-center justify-center rounded-md transition-colors shrink-0"
          style={{ color: 'var(--text-muted)', width: 20, height: 20 }}
          title="New terminal session"
        >
          <Plus size={12} />
        </button>
        {onClose && (
          <button
            onClick={onClose}
            className="ml-auto flex items-center justify-center rounded transition-colors shrink-0"
            style={{ color: 'var(--text-muted)', width: 22, height: 22 }}
            title="Close panel"
          >
            <ChevronDown size={14} />
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0">
        {sessions.map(s => (
          <TerminalSession key={s.id} active={s.id === activeId} sessionUuid={s.uuid} />
        ))}
      </div>
    </div>
  );
}
