# Reqly - Todo

## Queue

---


---


---

### Multi-Project Workspace

#### Phase 1: Bruno Parity - Multi-repo sidebar (no new file format)

> Goal: let developers open multiple project directories simultaneously and see all their collections in one grouped sidebar. Same as Bruno's model. Zero new file formats - just a path list in existing config.

#### Phase 2: Workspace Model + Cross-repo Flows (Reqly differentiation)

> Goal: go beyond Bruno. Introduce a named, shareable workspace definition and let flows reference requests from any repo in the workspace by alias. This is what makes Reqly uniquely agent-native for microservices teams.

### Desktop App Onboarding



- [ ] **T-233** Bundle server binary + 1-click AI agent setup wizard
  - **Context:** The Electron app currently requires the `reqly` CLI to be pre-installed via npm or Homebrew. Non-technical users who download the DMG directly hit a dead end. This task makes the Electron app fully self-contained and wires up AI agent connections without any terminal interaction. See decision-log.md 2026-07-02 for full rationale.
  - **Binary bundling:**
    - Use `pkg` or `@vercel/ncc` to compile the Reqly server into a standalone binary for each platform (macOS arm64, macOS x64, Windows x64, Linux x64)
    - Place compiled binaries at `packages/desktop/resources/bin/reqly` (platform-specific, packaged by electron-builder via `extraResources`)
    - Electron app spawns the bundled binary as the child process when no CLI is found on PATH
  - **PATH detection priority** (evaluated at launch and at "Connect" time):
    1. Homebrew CLI: check `/opt/homebrew/bin/reqly` and `/usr/local/bin/reqly`
    2. npm global CLI: `which reqly` / `where reqly`
    3. Bundled binary: `process.resourcesPath + '/bin/reqly'`
    - Use the first found. Developers who have the CLI keep using it so `brew upgrade` keeps agents current. Non-technical users transparently fall back to the bundled binary.
  - **Setup wizard UI** (`packages/desktop/src/SetupWizard.tsx`):
    - Shown on first launch (flag in `~/.reqly/config.json: setupComplete: true` suppresses it after)
    - "Connect your AI Agent" screen with icon buttons: Claude Desktop, Cursor, Windsurf, VS Code (Copilot)
    - Each button: find the agent's config file, inject the `mcpServers.reqly` entry using the resolved binary path, show a green checkmark on success
    - "Skip for now" exits to the main UI without connecting anything
    - Accessible again from Settings -> "AI Agent Connections" at any time
  - **MCP config injection per agent:**
    - Claude Desktop: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS), `%APPDATA%\Claude\claude_desktop_config.json` (Windows)
    - Cursor: `~/.cursor/mcp.json`
    - Windsurf: `~/.codeium/windsurf/mcp_config.json`
    - VS Code: `~/Library/Application Support/Code/User/settings.json` under `mcp.servers`
    - Merge into existing config (don't overwrite other entries); write `{ "command": "<resolvedPath>", "args": ["start", "--mcp-only"] }`
  - **"Install `reqly` in PATH" button** (Settings panel, optional):
    - Creates a symlink `/usr/local/bin/reqly -> <bundled binary path>`
    - Triggers a native macOS permission dialog; on Windows writes to a user-writable PATH dir
    - Only shown when no CLI is detected on PATH
  - **Use Sonnet for this task** - cross-platform binary compilation, PATH detection logic, and per-agent config file formats each have edge cases that need careful handling
  - Not TDD'd - this is Electron/build tooling glue; smoke-test by building a real DMG and verifying the wizard correctly injects config for at least Claude Desktop
  - **Docs to update in the same commit:**
    - `README.md`: update the installation section to document all three paths (DMG direct download, Homebrew, npm); explain the setup wizard and the "Connect your AI Agent" flow; update the MCP setup instructions to reflect that manual JSON editing is no longer needed for Electron users
    - `docs/llms.txt`: document the two-server architecture (Electron on ephemeral port, agent/CLI on 4242); document PATH detection priority so agents building Reqly automations understand which binary is authoritative; document that `responses.json` is the sync bridge between servers
    - `knowledge.md`: update the "How to install" and "How it works" sections to reflect the bundled binary model and the three installation paths; add a note on the two-server architecture and what syncs automatically vs. what is session-local (active environment)

### Multi-Project Workspace

- [ ] **T-226** Multi-Project Workspace Phase 2: Workspace Model + Cross-repo Flows
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

