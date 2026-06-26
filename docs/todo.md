# Reqly - Todo

<!--
Queue of upcoming tasks. Specced in roadmap.md, picked up by AI agents.
Format is flexible - one line for simple tasks, add bullets when the agent needs context to implement without back-and-forth.
On completion: check the box, cut the line into docs/done.md under today's date.
IDs never reuse - increment from the highest T-NNN in either this file or done.md.
-->

## Queue

- [ ] **T-097** Flow Runner - conditional branching + poll + retry - engine
  - Prerequisite: T-096 (core runner)
  - Implement `conditional` step: evaluate `if` expression against flow-local scope + last response fields. Expression is a simple equality/existence check (e.g. `response.body.role === 'admin'`, `flowVar === 'value'`) - no arbitrary JS eval for security. Support `goto <stepId>`, `skip` (skip to next step), `abort` (stop flow, mark failed). Circular `goto` loops must be detected and aborted with an error.
  - Implement `poll` step: fire the request repeatedly with `delay` ms between attempts, up to `maxAttempts`. After each response evaluate the `until` expression against `response.body`. If truthy, step passes and execution continues. If `maxAttempts` exhausted without truthy result, step fails. Extract and flow-local scope updates from poll responses apply only on the final successful poll.
  - TDD: failing tests first for: goto forward, goto backward (loop detection), skip, abort, poll success within attempts, poll timeout, poll with extract on success

- [ ] **T-098** Flows - MCP tools + Express routes
  - Prerequisite: T-096 (core runner must exist before exposing tools)
  - MCP tools (agents must have full parity with the UI): `create_flow`, `get_flow`, `list_flows`, `delete_flow`, `add_flow_step`, `update_flow_step`, `delete_flow_step`, `run_flow`
  - `run_flow` accepts `name` and optional `dataRow` (single row override for ad-hoc runs). Returns `FlowRunResult` structured object.
  - Express routes: `GET /api/flows`, `POST /api/flows`, `GET /api/flows/:name`, `DELETE /api/flows/:name`, `POST /api/flows/:name/steps`, `PUT /api/flows/:name/steps/:stepId`, `DELETE /api/flows/:name/steps/:stepId`, `POST /api/flows/:name/run`
  - TDD: tool contract tests asserting input/output schema for each MCP tool

- [ ] **T-099** Flows - CLI runner
  - Prerequisite: T-096
  - `reqly run-flow <name>` sub-command in `src/server/run-flow-command.ts`
  - Reuse existing JSON and TAP reporters from `reqly run <collection>` - extend them to handle `FlowRunResult` shape (per-step results, data row iterations)
  - Exit code 0 if all steps pass, exit code 1 if any step fails
  - `--data-row <json>` flag to inject a single data row override for one-off runs
  - Update `README.md` and `llms.txt` with `reqly run-flow` usage

- [ ] **T-100** Flows - UI
  - Prerequisite: T-098 (routes must exist)
  - **Pixel-match the design reference at `docs/tasks/T-100-flows-ui-reference.html`** - open it in a browser before writing a single line of React. Every spacing, color, border, and badge must match that file exactly.
  - Nav rail: add `ti-git-branch` (Tabler icon) between GraphQL and Capture icons. Active state: `bg-blue-500/10` chip + 3px left accent bar, same pattern as all other nav icons.
  - Sidebar: flow list with `+` icon button in header. Each row shows flow name, and a pass/fail badge from the last run result (green `badge-pass` / red `badge-fail`). No badge if never run. Click opens the flow. Same pattern as CollectionsPanel.
  - Top bar: flow name (13px 500), description (12px muted), right-aligned buttons: "Data (N rows)" (only when flow has data), "Settings", "Run flow" (primary/blue).
  - Step cards: `border: 0.5px solid var(--border)`, `background: var(--surface-2)`. Passed steps get `border-left: 3px solid #3B6D11`. Failed steps get `border-left: 3px solid #A32D2D`. Pending steps have no left border override.
  - Step header (always visible): 16px circle status indicator (check/x/empty), type badge pill (color per type - see reference), step id label (12px 500), meta description (11px muted, truncated), timing (11px muted, right-aligned), chevron. Click header to expand/collapse.
  - Type badge colors (pills, 10px): `run` = blue bg/text, `extract` = purple bg/text, `assert` = green bg/text, `poll` = amber bg/text, `if`/`conditional` = warning bg/text.
  - Expanded step body: field/value rows with 52px muted label column + monospace value in a code pill (`background: var(--surface-0)`). Failed assertions show received value in `var(--text-danger)`. Response snippets shown in a monospace block with green `+` lines for extracted values.
  - Data panel: 196px right-side column, only rendered when `flow.data` is non-empty. Header "Data rows" with table icon. Each row shows label (Row 1, Row 2...), variable values as monospace subtitle, and pass/fail dot + count from last run. Click a row to switch the step results view to that row's run.
  - Results bar: fixed bottom strip. Dots + counts for passed / failed / pending. Total duration + "row N of M" on the right.
  - Add step button: dashed border pill at the bottom of the step list. On click: show an inline picker for step type (run / extract / assert / poll / if).
  - Flow Settings modal (triggered from Settings button): name field, description field, data table editor (same `KeyValueEditor` component used elsewhere, one row per data object).
  - No new components needed for assertions - reuse existing `AssertionEditor`. No drag-to-reorder in v1 - add step appends to bottom, steps can be deleted via hover trash icon.

- [x] **T-090** Collection-level auth - engine + MCP

- [x] **T-091** Collection-level auth - UI

