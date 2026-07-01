# Reqly - Todo

## Queue

### M6 - Script Power + Developer UX

### M7 - Data & CI Power

### GraphQL Polish


### Protocol Expansion (Later)

- [ ] **T-151** WebSocket / SSE support ("Realtime" workspace)
  - `type: websocket` and `type: sse` request types stored in collection YAML alongside REST requests
  - UI: dedicated "Realtime" nav rail icon (shares one icon - WebSocket and SSE are both persistent-connection protocols with the same stream-view paradigm; protocol selected by a tab/picker inside the workspace)
  - Realtime workspace: URL bar, Connect/Disconnect button, live append-only message stream panel with timestamps and direction indicators (sent/received), message composer for WebSocket
  - Saved Realtime requests appear in the Collections panel like any other request; opening from Collections switches the editor to the Realtime view
  - MCP tool `run_request` handles both types; for agents it connects, buffers messages for a configurable timeout (default 5s), and returns `{ messages: [...], truncated: boolean }`
  - **Use Sonnet** for this task - streaming state management in UI and MCP buffering model require careful design
