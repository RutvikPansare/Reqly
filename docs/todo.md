# Reqly - Todo

<!--
Queue of upcoming tasks. Specced in roadmap.md, picked up by AI agents.
Format is flexible - one line for simple tasks, add bullets when the agent needs context to implement without back-and-forth.
On completion: check the box, cut the line into docs/done.md under today's date.
IDs never reuse - increment from the highest T-NNN in either this file or done.md.
-->

## Queue

- [ ] **T-103** Mock server - UI
  - Prerequisite: T-102
  - Add a "Mock" tab to the existing Capture panel (same pattern as the Outbound/Webhooks tabs already there) - no new nav rail icon needed
  - Mock tab contents when stopped: collection picker dropdown, port input (default 4243), "Start mock" button
  - Mock tab contents when running: green status indicator + "Running on :4243", active route table (method badge + path + example count per row), "Stop mock" button
  - Route rows are read-only - clicking a route opens the corresponding request in the collections panel so the developer can add/edit examples
  - Poll `GET /api/mock/status` every 3s while the tab is visible to keep status fresh (same pattern as the proxy status polling in CapturePanel)
