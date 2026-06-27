# Reqly - Todo

<!--
Queue of upcoming tasks. Specced in roadmap.md, picked up by AI agents.
Format is flexible - one line for simple tasks, add bullets when the agent needs context to implement without back-and-forth.
On completion: check the box, cut the line into docs/done.md under today's date.
IDs never reuse - increment from the highest T-NNN in either this file or done.md.
-->

## Queue

- [ ] **T-112** Embedded terminal in localhost UI
  - **Architecture:** simple command runner (no `node-pty`, no native addons). Backend spawns commands via `child_process.spawn`, streams stdout/stderr over WebSocket. Upgradeable to full PTY later by swapping spawn for node-pty in the backend - frontend stays unchanged.
  - **Backend - `src/server/terminal.ts`:**
    - WebSocket server mounted on the existing Express instance at `/terminal` (use `ws` package - already likely a transitive dependency, otherwise add it)
    - On message `{ type: 'run', command: string }`: spawn `bash -c <command>` (or `cmd /c` on Windows) with `child_process.spawn`, `cwd` set to project root (`CollectionManager.getBaseDir()`)
    - Pipe stdout/stderr chunks to the WebSocket client as `{ type: 'stdout' | 'stderr', data: string }` messages
    - On process exit send `{ type: 'exit', code: number }`
    - On message `{ type: 'kill' }`: kill the running process (SIGTERM, fallback SIGKILL after 2s)
    - Only one process at a time per WebSocket connection - if a command is already running, send `{ type: 'error', message: 'A command is already running' }`
    - No authentication needed - Reqly already only binds to localhost
  - **Frontend - `TerminalPanel.tsx`:**
    - New nav rail icon (use `ti-terminal` from Tabler) at the bottom of the rail above Settings
    - Uses `xterm.js` (`@xterm/xterm`) for rendering - load from CDN (`cdnjs.cloudflare.com`) in the Vite build, or install as a dependency. xterm.js handles ANSI color codes and escape sequences natively - no need for `ansi-to-html`.
    - `xterm/css/xterm.css` imported for correct rendering
    - On panel open: connect WebSocket to `ws://localhost:4242/terminal`
    - Input bar at the bottom: text input + Enter to send `{ type: 'run', command }`. Command history via up/down arrow keys (in-memory array, last 50 commands).
    - Output renders in the xterm.js terminal instance. On exit: show exit code as a muted line `[exited with code 0]`
    - "Clear" button top-right clears the terminal (`term.clear()`)
    - "Kill" button (shown only while a command is running) sends `{ type: 'kill' }`
    - Terminal background matches the app's dark theme: `theme: { background: '#0f0f0f', foreground: '#e8e8e6' }` on the xterm instance
    - On WebSocket disconnect: show `[disconnected - reload to reconnect]` in amber
  - **Upgrade path note (for the agent):** the entire backend swap to full PTY is isolated to `src/server/terminal.ts`. Replace `child_process.spawn` with `node-pty`'s `pty.spawn`, forward resize events (`{ type: 'resize', cols, rows }`) to `pty.resize()`, and send `pty.onData` instead of stdout/stderr chunks. Frontend is unchanged.
  - No new MCP tool needed - the terminal is a human-facing feature. Agents already have `exec_with_proxy` and CLI tools.
  - No TDD for the WebSocket handler (I/O-bound, process lifecycle) - manual verification is sufficient. Do write a smoke test asserting the `/terminal` WebSocket endpoint exists and accepts connections.

- [ ] **T-110** GitHub Actions export for flows
  - `reqly export-flow <name> --format github-actions` CLI sub-command
  - Generates a GitHub Actions workflow YAML file at `.github/workflows/<flow-name>.yml` in the project root (creates the `.github/workflows/` directory if it doesn't exist)
  - Template:
    ```yaml
    name: <flow-name>
    on: [push, pull_request]
    jobs:
      flow:
        runs-on: ubuntu-latest
        steps:
          - uses: actions/checkout@v4
          - name: Install Reqly
            run: npm install -g @rutvikpansare123/reqly
          # If your flow tests a local server, add a step here to start it
          # - name: Start server
          #   run: npm run dev &
          - name: Start Reqly
            run: reqly start --project-dir . &
          - name: Run flow
            run: reqly run-flow <flow-name>
    ```
  - Substitutes the real flow name in `name:` and `run: reqly run-flow <flow-name>`
  - Prints confirmation: `Written to .github/workflows/<flow-name>.yml` and a one-line tip: `Add a 'Start server' step before 'Run flow' if your flow hits a local API`
  - MCP tool `export_flow_ci`: `{ flow: string, format: 'github-actions' }` - same output, writes the file and returns the path. Agents can wire up CI for a flow without the developer touching a terminal.
  - Express route: `POST /api/flows/:name/export-ci` with body `{ format: 'github-actions' }` - returns the generated YAML as a string (does not write to disk from the UI path - let the developer download or copy it)
  - Update `README.md` and `llms.txt` with the `export-flow` command and `export_flow_ci` MCP tool
  - No new dependencies needed - pure string templating

