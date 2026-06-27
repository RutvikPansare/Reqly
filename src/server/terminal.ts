import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as pty from 'node-pty';

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

// Embedded terminal for the localhost UI. Each WS connection gets its own
// persistent PTY-backed shell (real bash, full readline/job control/cd
// support, and capable of running interactive programs like `claude`,
// `vim`, `top`, etc.) - not a one-shot `spawn` per command. Keystrokes are
// forwarded to the PTY verbatim; the PTY's own output (including its shell
// prompt) is streamed straight back, so the terminal behaves like a real one.
export function attachTerminal(server: Server, getProjectRoot: () => string): WebSocketServer {
  ensureSpawnHelperExecutable();
  const wss = new WebSocketServer({ server, path: '/terminal' });

  wss.on('connection', (ws: WebSocket) => {
    const shell = process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL || '/bin/bash');
    const shellArgs = process.platform === 'win32' ? [] : ['-i'];

    const ptyProcess = pty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: getProjectRoot(),
      env: { ...process.env, TERM: 'xterm-256color' } as Record<string, string>,
    });

    const send = (msg: unknown) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
    };

    ptyProcess.onData((data) => send({ type: 'data', data }));
    ptyProcess.onExit(({ exitCode, signal }) => {
      send({ type: 'exit', code: exitCode, signal: signal ?? undefined });
    });

    ws.on('message', (raw) => {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        send({ type: 'error', message: 'Invalid message' });
        return;
      }

      if (msg.type === 'input') {
        ptyProcess.write(msg.data);
      } else if (msg.type === 'resize') {
        const cols = Number(msg.cols);
        const rows = Number(msg.rows);
        if (cols > 0 && rows > 0) ptyProcess.resize(cols, rows);
      } else if (msg.type === 'kill') {
        // SIGINT to the foreground process group, same as a real terminal's Ctrl+C.
        ptyProcess.write('\x03');
      }
    });

    ws.on('close', () => {
      ptyProcess.kill();
    });
  });

  return wss;
}
