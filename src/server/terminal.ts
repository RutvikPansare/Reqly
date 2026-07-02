import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as pty from 'node-pty';
import { IPty } from 'node-pty';

// node-pty's npm package extracts its native `spawn-helper` binary without
// the executable bit on some install paths (seen on a fresh `npm install`
// here), which makes every pty.spawn() fail with "posix_spawnp failed."
// Self-heal it once at startup rather than depending on every consumer's
// install/packaging step getting file permissions right.
function ensureSpawnHelperExecutable() {
  if (process.platform === 'win32') return;
  try {
    const helper = path.join(
      path.dirname(require.resolve('node-pty/package.json')),
      'prebuilds',
      `${process.platform}-${process.arch}`,
      'spawn-helper'
    );
    if (fs.existsSync(helper)) fs.chmodSync(helper, 0o755);
  } catch {
    // best-effort - if this fails, pty.spawn() will surface the real error
  }
}

// Output buffer: keep the last 100 KB. When exceeded, trim to 80 KB so we
// always have a meaningful replay window without unbounded memory growth.
const MAX_BUFFER = 100 * 1024;
const TRIM_TO    =  80 * 1024;

// Sessions with 0 connected clients are kept alive for 10 minutes, then
// killed. This lets a browser refresh re-attach immediately without leaking
// idle PTY processes forever.
const IDLE_CLEANUP_MS = 10 * 60 * 1000;

interface Session {
  pty: IPty;
  buffer: string;
  clients: Set<WebSocket>;
  idleTimer: ReturnType<typeof setTimeout> | null;
}

// Module-level registry: survives individual WebSocket disconnects so clients
// can re-attach after a browser refresh without losing shell state.
const sessions = new Map<string, Session>();

function trimBuffer(buf: string): string {
  return buf.length > MAX_BUFFER ? buf.slice(buf.length - TRIM_TO) : buf;
}

function cleanupSession(sessionId: string) {
  const s = sessions.get(sessionId);
  if (!s) return;
  if (s.idleTimer) clearTimeout(s.idleTimer);
  try { s.pty.kill(); } catch { /* already gone */ }
  sessions.delete(sessionId);
}

function scheduleIdleCleanup(sessionId: string, s: Session) {
  if (s.idleTimer) clearTimeout(s.idleTimer);
  s.idleTimer = setTimeout(() => {
    if (s.clients.size === 0) cleanupSession(sessionId);
  }, IDLE_CLEANUP_MS);
}

// Exported so tests can wipe state between runs.
export function clearSessions() {
  for (const [id] of sessions) cleanupSession(id);
}

// Embedded terminal for the localhost UI. Each WebSocket connection sends an
// `attach` message first carrying a client-generated UUID. The server either
// spawns a new PTY (unknown UUID) or re-attaches to an existing one (known
// UUID), replaying buffered output so the client sees what it missed.
export function attachTerminal(server: Server, getProjectRoot: () => string): WebSocketServer {
  ensureSpawnHelperExecutable();
  const wss = new WebSocketServer({ server, path: '/terminal' });

  // When the HTTP server fails to bind (EADDRINUSE), the ws library propagates
  // the error to the WebSocketServer. Without this handler the process crashes
  // with an unhandled 'error' event. The HTTP server's own error handler in
  // index.ts already logs the warning and continues MCP-only.
  wss.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code !== 'EADDRINUSE') throw err;
  });

  wss.on('connection', (ws: WebSocket) => {
    let sessionId: string | null = null;
    let session: Session | null = null;

    const send = (msg: unknown) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    };

    ws.on('message', (raw) => {
      let msg: any;
      try { msg = JSON.parse(raw.toString()); } catch {
        send({ type: 'error', message: 'Invalid JSON' });
        return;
      }

      // Every connection must start with an `attach` handshake carrying the
      // client-generated session UUID. All subsequent messages are routed to
      // that session's PTY.
      if (!sessionId) {
        if (msg.type !== 'attach' || typeof msg.sessionId !== 'string') {
          send({ type: 'error', message: 'First message must be {type:"attach",sessionId}' });
          return;
        }

        sessionId = msg.sessionId;
        const cols = Math.max(1, Number(msg.cols) || 80);
        const rows = Math.max(1, Number(msg.rows) || 24);

        if (sessions.has(sessionId!)) {
          // Re-attach: cancel idle timer, plug this client in, replay buffer.
          session = sessions.get(sessionId!)!;
          if (session.idleTimer) { clearTimeout(session.idleTimer); session.idleTimer = null; }
          session.clients.add(ws);
          session.pty.resize(cols, rows);
          send({ type: 'ready', replay: session.buffer, isNew: false });
        } else {
          // New session: spawn a PTY and register it.
          const shell = process.platform === 'win32'
            ? 'powershell.exe'
            : (process.env.SHELL || '/bin/bash');
          const shellArgs = process.platform === 'win32' ? [] : ['-i'];

          const ptyProcess = pty.spawn(shell, shellArgs, {
            name: 'xterm-256color',
            cols,
            rows,
            cwd: getProjectRoot(),
            env: { ...process.env, TERM: 'xterm-256color' } as Record<string, string>,
          });

          session = { pty: ptyProcess, buffer: '', clients: new Set([ws]), idleTimer: null };
          sessions.set(sessionId!, session);

          const sess   = session;   // capture for PTY callbacks
          const sid    = sessionId!;

          ptyProcess.onData((data) => {
            const raw = sess.buffer + data;
            // Strip zsh PROMPT_SP ('%' + spaces + '\r') from the very start of
            // the accumulated buffer so it is never replayed to re-attaching clients.
            sess.buffer = trimBuffer(raw.replace(/^%[^\r]*\r/, ''));
            for (const client of sess.clients) {
              if (client.readyState === WebSocket.OPEN)
                client.send(JSON.stringify({ type: 'data', data }));
            }
          });

          ptyProcess.onExit(({ exitCode, signal }) => {
            const msg = JSON.stringify({ type: 'exit', code: exitCode, signal: signal ?? undefined });
            for (const client of sess.clients) {
              if (client.readyState === WebSocket.OPEN) client.send(msg);
            }
            cleanupSession(sid);
          });

          send({ type: 'ready', replay: '', isNew: true });
        }
        return;
      }

      // Normal messages after attach.
      if (!session) return;
      if (msg.type === 'input')  { session.pty.write(msg.data); }
      else if (msg.type === 'resize') {
        const c = Math.max(1, Number(msg.cols));
        const r = Math.max(1, Number(msg.rows));
        if (c && r) session.pty.resize(c, r);
      } else if (msg.type === 'kill') {
        session.pty.write('\x03');  // Ctrl+C to foreground process group
      }
    });

    ws.on('close', () => {
      if (!session || !sessionId!) return;
      session.clients.delete(ws);
      // Don't kill the PTY - schedule idle cleanup instead so the session
      // survives a browser refresh (client will re-attach within seconds).
      if (session.clients.size === 0) scheduleIdleCleanup(sessionId!, session);
    });
  });

  return wss;
}
