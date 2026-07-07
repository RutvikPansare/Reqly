# Reqly - Todo

<!--
Queue of upcoming tasks. Specced in roadmap.md, picked up by AI agents.
Format is flexible - one line for simple tasks, add bullets when the agent needs context to implement without back-and-forth.
On completion: check the box, cut the line into docs/done.md under today's date.
IDs never reuse - increment from the highest T-NNN in either this file or done.md.
-->

## Queue

---

### UI Polish

- [ ] **T-252** Lock icon + improved tooltip on agent-locked project widget
  - File: `src/ui/src/components/CollectionsPanel/ProjectPathWidget.tsx`
  - **Current behaviour:** when `isAgentActive`, the "change" span still appears on hover (cursor-not-allowed), and the `title` attribute shows a plain browser tooltip.
  - **Change 1 - lock icon:** import `Lock` from `lucide-react`. When `isAgentActive`, replace the `<span>change</span>` with `<Lock size={11} style={{ color: 'var(--text-muted)', flexShrink: 0, opacity: 0.6 }} />`. The lock should always be visible (no `opacity-0 group-hover:opacity-100`), not just on hover. Remove `cursor-not-allowed` from the button class - `cursor-default` is cleaner.
  - **Change 2 - tooltip:** replace the `title` attribute with a small custom tooltip div that appears on hover. It should say:
    - Heading (small, text-primary): "Project locked to agent session"
    - Body (text-muted, text-xs): "An AI agent is actively using this project. To switch folders: stop the agent session, or use the Reqly desktop app."
    - Style: `position: absolute`, dark surface-0 bg, border-strong, border-radius-md, padding 8px 10px, z-index 50, max-width 220px, top-full left-0 mt-1. Use local `useState(false)` for hover toggled via `onMouseEnter`/`onMouseLeave` on the button.
  - No new dependencies. No other files change.
  - No TDD required (pure UI render change, no logic).
  - **Use Haiku** - straightforward component edit.

---

### Cross-repo Flows (post-launch)

- [ ] **T-227** Cross-repo flows with `repo: <alias>` step field
  - **Engine:** Extend flow step `type: run` to accept an optional `repo: <alias>` field. Flow runner resolves `repo` via active workspace config to the correct `projectDir`, instantiates a scoped `CollectionManager` for that dir, and executes the request. Steps without `repo:` use the active project as today.
  - **CLI/MCP:** `run_flow` and `reqly run-flow` accept `--workspace <name>` to load alias resolution. Cross-repo flow YAMLs live in `~/.reqly/workspaces/<name>/flows/`.
  - **UI:** Flow builder step picker shows a repo selector dropdown (populated from active workspace aliases) when a workspace is active. Step cards display `auth / users / login` breadcrumb instead of `users / login`.
  - Update `llms.txt` with cross-repo flow YAML format, `repo:` field semantics, and workspace flag docs.
  - **Use Fable**
