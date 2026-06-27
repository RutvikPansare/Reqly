# Reqly - Todo

<!--
Queue of upcoming tasks. Specced in roadmap.md, picked up by AI agents.
Format is flexible - one line for simple tasks, add bullets when the agent needs context to implement without back-and-forth.
On completion: check the box, cut the line into docs/done.md under today's date.
IDs never reuse - increment from the highest T-NNN in either this file or done.md.
-->

## Queue

- [ ] **T-107** OpenAPI contract validation - UI
  - Prerequisite: T-106
  - **CollectionSettingsModal:** add a "Contract" tab alongside Variables and Auth. Contains: spec source toggle (File path / URL), text input for the path or URL, a "Load spec" button that calls `PUT /api/collections/:name/spec` and shows operation count on success, a "Remove" button to clear it.
  - **Response viewer:** add a "Contract" tab in the tab bar (alongside Headers, Assertions, Console, Examples). Only rendered when the active request's collection has a spec configured. Shows:
    - If no violations: green "All checks passed" with operation name matched (e.g. `GET /users/{id} · getUser`)
    - If violations: red count badge on the tab, list of violations with field path, message, and severity badge (error = red, warning = amber)
    - If spec configured but operation not matched: amber "No matching operation found" with the inferred path shown so the developer knows to set `specOperationId`
  - Contract tab data comes from `contractViolations` already returned by `POST /api/run/adhoc` (wire it through - same pattern as `diff` was added). No extra API call needed.
