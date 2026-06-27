import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { spawn, ChildProcess } from 'child_process';

// Embedded terminal for the localhost UI. Simple command runner (no PTY) -
// spawns one shell command at a time per connection and streams its output.
// Upgrade path to a full PTY: swap `spawn` for `node-pty`'s `pty.spawn` here,
// forward a `resize` message to `pty.resize()`, and send `pty.onData` chunks
// instead of stdout/stderr. The frontend protocol does not need to change.
export function attachTerminal(server: Server, getProjectRoot: () => string): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/terminal' });

  wss.on('connection', (ws: WebSocket) => {
    let child: ChildProcess | null = null;

    const send = (msg: unknown) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
    };

    ws.on('message', (raw) => {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        send({ type: 'error', message: 'Invalid message' });
        return;
      }

      if (msg.type === 'run') {
        if (child) {
          send({ type: 'error', message: 'A command is already running' });
          return;
        }
        const shell = process.platform === 'win32' ? 'cmd' : 'bash';
        const shellArgs = process.platform === 'win32' ? ['/c', msg.command] : ['-c', msg.command];
        child = spawn(shell, shellArgs, { cwd: getProjectRoot() });

        child.stdout?.on('data', (chunk) => send({ type: 'stdout', data: chunk.toString() }));
        child.stderr?.on('data', (chunk) => send({ type: 'stderr', data: chunk.toString() }));
        child.on('exit', (code, signal) => {
          // A signal-killed process reports code: null - report 1 (not 0,
          // which would falsely read as a clean exit) and include the signal.
          send({ type: 'exit', code: code ?? (signal ? 1 : 0), signal: signal ?? undefined });
          child = null;
        });
      } else if (msg.type === 'kill') {
        if (!child) return;
        const toKill = child;
        toKill.kill('SIGTERM');
        setTimeout(() => {
          if (!toKill.killed) toKill.kill('SIGKILL');
        }, 2000);
      }
    });

    ws.on('close', () => {
      if (child) child.kill('SIGTERM');
    });
  });

  return wss;
}
