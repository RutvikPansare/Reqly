# Reqly - Todo

<!--
Queue of upcoming tasks. Specced in roadmap.md, picked up by AI agents.
Format is flexible - one line for simple tasks, add bullets when the agent needs context to implement without back-and-forth.
On completion: check the box, cut the line into docs/done.md under today's date.
IDs never reuse - increment from the highest T-NNN in either this file or done.md.
-->

## Queue

- [x] **T-090** Collection-level auth - engine + MCP

- [ ] **T-091** Collection-level auth - UI
  - Prerequisite: T-090 must be done first
  - Add auth config to the "Collection Settings" modal introduced in T-089 (same modal, new "Auth" tab alongside "Variables")
  - Auth editor mirrors the request-level Auth tab: type selector (None / Bearer / API Key / Basic / OAuth2), inline credential fields or profile picker
  - Distinguish clearly in copy: "Auth set here applies to all requests in this collection unless a request overrides it"
  - Inherited headers panel (already built) reads collection auth as a source - extend it to show collection-auth-injected headers with source = "collection" instead of "profile"

