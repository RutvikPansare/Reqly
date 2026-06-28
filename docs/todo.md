# Reqly - Todo

<!--
Queue of upcoming tasks. Specced in roadmap.md, picked up by AI agents.
Format is flexible - one line for simple tasks, add bullets when the agent needs context to implement without back-and-forth.
On completion: check the box, cut the line into docs/done.md under today's date.
IDs never reuse - increment from the highest T-NNN in either this file or done.md.
-->

## Queue

### JUnit XML reporter + README refresh

- [x] **T-135** JUnit XML reporter for `reqly run` and `reqly run-flow`
  - Add `--format junit` to the CLI alongside existing `--format console` (default) and `--format json`.
  - Output a standard JUnit XML `<testsuite>` / `<testcase>` document to stdout when `--format junit` is passed. Shape:
    ```xml
    <testsuite name="collection-name" tests="N" failures="F" time="T">
      <testcase name="request-name :: assertion-label" classname="collection-name" time="T">
        <!-- on failure only: -->
        <failure message="expected 200, got 404">full diff or description</failure>
      </testcase>
    </testsuite>
    ```
  - Each assertion on a request = one `<testcase>`. A request with no assertions = one `<testcase>` that passes if status < 500.
  - `time` attribute is seconds (float, 3dp).
  - Write output to stdout so CI can redirect: `reqly run my-collection --format junit > results.xml`
  - Update `src/server/run-command.ts` and `src/server/run-flow-command.ts` to branch on `parsed.flags.format`.
  - Extract a `src/engine/reporters/junit.ts` module with a pure function `toJUnit(results): string` - no side effects, easy to test.
  - TDD: `junit.test.ts` - at minimum: all-pass suite, suite with one failure, suite with multiple assertions per request, request with no assertions (implicit pass). Run against the existing result shape from `CollectionRunner`.
  - Update the scaffolded GitHub Actions export (`github-actions-export.ts`) to pass `--format junit` and add an `actions/upload-artifact` step for `results.xml` in the generated workflow.
  - Update `docs/llms.txt` and README CLI reference section to document `--format junit`.

- [x] **T-136** README refresh - hero GIF, quick start, works-with logos, star chart
  - **GIF**: Record a ~30s looping screen capture showing the core MCP workflow: agent types "create a collection for my Express API" -> Reqly MCP tool fires -> collection appears in the UI sidebar -> agent runs it -> response shown. Export as an optimised GIF or MP4 (use `ffmpeg` or Kap). Embed near the top of README, below the one-line description.
    - If recording tooling isn't available, add a placeholder `docs/assets/demo.gif` path and an HTML comment `<!-- TODO: record demo GIF -->` so it's clear where it goes.
  - **Badges row** (top of README, one line): npm version badge, license badge, CI status badge (GitHub Actions). Use shields.io.
  - **"Works with" logos**: add a row of small icons/text for Cursor, Claude Code, Gemini CLI, VS Code (Claude extension). Can use simple text links or SVG badges - no need for custom graphics.
  - **Install block**: make sure `npm install -g reqly` is visible without scrolling, in a fenced code block, immediately after the one-sentence description.
  - **Quick start section**: five steps max, copy-pasteable. `npm i -g reqly` -> `cd my-project` -> `reqly init` -> `reqly setup cursor` -> "Ask Cursor: list my Reqly collections". Should take under 2 minutes.
  - **Star history**: add a `[![Star History Chart](https://api.star-history.com/svg?repos=RutvikPansare/Reqly&type=Date)](https://star-history.com/#RutvikPansare/Reqly)` block near the bottom. Renders as a live chart on GitHub.
  - **Sync**: after updating README.md, apply the same install/quick-start/CLI changes to `docs/llms.txt` so agents reading that file stay current.

### M5 - Windows Support

### Project switcher MCP tools + UI

### Agent onboarding nudge (empty state)

### M5 - Desktop App (Electron)

- [ ] **T-120** Electron wrapper and server process (M5)
  - `packages/app/` Electron entry point
  - Main process spawns the Reqly server as a child process (`child_process.spawn('reqly', ['start'])` or direct module import)
  - `BrowserWindow` opens pointing at `http://localhost:4242`
  - On window close: hide to tray rather than quit (server keeps running)
  - On tray quit: kill child process cleanly

- [ ] **T-121** System tray icon (M5)
  - Tray icon with context menu: "Open Reqly", "Active project: \<path\>", "Stop Reqly", "Quit"
  - Double-click tray icon: open/focus the `BrowserWindow`
  - Show server status (running/stopped) as tray icon badge or tooltip

- [ ] **T-122** Auto-start on login (M5)
  - Opt-in toggle in Settings UI: "Launch Reqly at login"
  - Mac: `app.setLoginItemSettings({ openAtLogin: true })`
  - Windows: write registry key `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
  - Persist preference to `~/.reqly/config.json`

- [ ] **T-123** Auto-updater (M5)
  - Integrate `electron-updater` (from `electron-builder`)
  - On startup: check GitHub Releases for a newer version
  - Download in background, prompt user to restart and install
  - Required for users who installed via DMG/EXE rather than npm (npm users get updates via `npm update -g`)

- [ ] **T-124** Installers and code signing (M5)
  - `electron-builder` config for DMG (Mac) and NSIS installer (Windows)
  - Mac: Apple Developer account required for notarization. Without it macOS blocks the app on first run.
  - Windows: EV code signing certificate required for SmartScreen clearance. Without it Windows shows "Unknown publisher" warning on install.
  - GitHub Actions build matrix: produce signed DMG and signed NSIS in CI
  - Document signing setup in `docs/decision-log.md`

- [ ] **T-125** `reqly app` CLI command (M5)
  - `reqly app` opens the Electron window if already running, launches it if not
  - Bridges users who started via CLI into the desktop app experience
  - Works via IPC socket or checking for the Electron process by name
