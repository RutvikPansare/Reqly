# Reqly - Todo

## Queue

---

### Port Strategy + Process Model

- [ ] **T-230** Agent-vs-Electron port strategy: Electron ephemeral, agents compete for 4242
  - **Electron**: call `listen(0)` so OS assigns a free ephemeral port (e.g. 51234). Never hardcode 4242. Write `{ type: 'electron', pid, port }` to lock file. Webview loads at the assigned port.
  - **Agent MCP process**: always try port 4242. If free, take it. If taken: read lock file, check `type`. If `type === 'agent'`, kill the old process by PID and take over 4242. If `type === 'electron'`, do not kill - run Express on any free port instead (Electron has its own UI, so 4242 is just a bonus for the browser tab).
  - Add `type: 'electron' | 'agent'` field to lock file schema in `src/server/lock.ts`.
  - Update `writeLock()` to accept and store the type.
  - Update startup logic in `src/server/index.ts` to implement the takeover logic described above.
  - Result: browser tab at `localhost:4242` always shows the most recent agent session. Electron UI always available at its own stable port. No fallback complexity.

- [ ] **T-231** Fix WebSocket server crash on EADDRINUSE when port is taken
  - When Express fails to bind (EADDRINUSE), the WebSocket server attached to the same HTTP server also emits an unhandled `error` event, which crashes the Node process instead of gracefully continuing.
  - The `expressServer.on('error', ...)` handler in `src/server/index.ts` only catches the HTTP server error - the WebSocket `error` event is separate and unhandled.
  - Fix: attach an `error` handler to the WebSocket server instance directly in `src/server/express.ts` (wherever the WS server is created), swallowing EADDRINUSE specifically.
  - Verify: starting a second reqly process when port is taken should log a warning and continue as MCP-only without crashing.

---



---

### Multi-Project Workspace

#### Phase 1: Bruno Parity - Multi-repo sidebar (no new file format)

> Goal: let developers open multiple project directories simultaneously and see all their collections in one grouped sidebar. Same as Bruno's model. Zero new file formats - just a path list in existing config.

#### Phase 2: Workspace Model + Cross-repo Flows (Reqly differentiation)

> Goal: go beyond Bruno. Introduce a named, shareable workspace definition and let flows reference requests from any repo in the workspace by alias. This is what makes Reqly uniquely agent-native for microservices teams.

- [ ] **T-228** Fix `CollectionsPanel.tsx` build error (pre-existing from T-225)
  - TS compiler reports unclosed JSX/brace at line 679 in `src/ui/src/components/CollectionsPanel.tsx`
  - Build fails silently (UI vite build may succeed but `tsc -b` errors)
  - Fix the JSX structure and verify `npm run build` passes clean with zero errors


  - **Engine:** Define workspace YAML schema:
    ```yaml
    name: checkout-team
    repos:
      - alias: auth
        path: /repos/auth-service
      - alias: payments
        path: /repos/payments-service
    sharedEnv:
      STAGING_BASE_URL: https://staging.example.com
    ```
  - **CLI:** `reqly workspace create <name>` scaffolds `~/.reqly/workspaces/<name>/workspace.yaml`. `reqly workspace link <name> <alias> <path>` adds a repo entry. `reqly workspace use <name>` sets active workspace.
  - **MCP:** `create_workspace`, `link_workspace_repo`, `use_workspace` tools. Full agent control over workspace setup.
  - **UI:** Workspace dropdown in nav rail header (above the project list). "New workspace" flow walks through naming + linking repos. Workspace settings panel shows repo aliases and shared env vars.
  - Workspace files live in `~/.reqly/workspaces/<name>/` - machine-local, not in any repo. `alias` names are stable across teammates (each developer runs `reqly workspace link` with their local path).

- [ ] **T-227** Cross-repo flows
  - **Engine:** Extend flow step `type: run` to accept an optional `repo: <alias>` field. Flow runner resolves `repo` via active workspace config to the correct `projectDir`, instantiates a scoped `CollectionManager` for that dir, and executes the request. Steps without `repo:` use the active project as today.
    ```yaml
    steps:
      - type: run
        id: login
        repo: auth             # resolves to /repos/auth-service/.reqly/
        collection: users
        request: login
      - type: extract
        from: login
        path: body.token
        into: authToken
      - type: run
        id: create-order
        repo: payments         # resolves to /repos/payments-service/.reqly/
        collection: orders
        request: create
    ```
  - **CLI/MCP:** `run_flow` and `reqly run-flow` accept `--workspace <name>` to load alias resolution. Cross-repo flow YAMLs live in `~/.reqly/workspaces/<name>/flows/` and can also be referenced from any repo's `.reqly/flows/` for single-repo flows.
  - **UI:** Flow builder step picker shows a repo selector dropdown (populated from active workspace aliases) when a workspace is active. Step cards display `auth / users / login` breadcrumb instead of `users / login`.
  - Update `llms.txt` with cross-repo flow YAML format, `repo:` field semantics, and workspace flag docs.

