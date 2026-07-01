# Reqly - Todo

## Queue

### M6 - Script Power + Developer UX

### M7 - Data & CI Power

### GraphQL Polish


### Realtime Workspace Epic (T-185 through T-194)

> **Architecture mandate - read knowledge.md "Protocol Architecture Rule" section before starting.**
>
> TL;DR: Two use cases, two patterns. Do NOT mix them.
>
> **Agent/MCP use (ephemeral, bounded):**
> Engine `realtime-executor.ts` connects → buffers for `captureTimeout` seconds → disconnects → returns `{ messages, truncated }`. Same pattern as `grpc-streaming.ts`. One MCP tool: `run_realtime`. Stateless, no sessions, no server memory.
>
> **UI interactive use (long-lived, browser-native):**
> Browser connects DIRECTLY to the target server using native browser APIs and browser-compatible npm packages in `src/ui/package.json`. No proxy through the Reqly server. Sessions live in the browser tab. `new WebSocket(url)` and `new EventSource(url)` are native - zero packages. `socket.io-client` and `mqtt` (browser builds) go in `src/ui/package.json` only. Nothing new in root `package.json`.
>
> **Key paths:**
> - Types: `src/types/request.ts`
> - Engine (MCP path): `src/engine/realtime-executor.ts` (NEW)
> - MCP tool: `src/mcp/tools/run-realtime.ts` (NEW)
> - UI packages: `src/ui/package.json` only
> - UI components: `src/ui/src/components/`
> - UI hooks: `src/ui/src/hooks/`
> - Colors/badges: `src/ui/src/lib/colors.ts`
>
> **Existing patterns to follow:**
> - All local imports end in `.js` even when source is `.ts`
> - TDD mandatory for `src/engine/` and `src/mcp/` code
> - Tab persistence: debounced `localStorage.setItem` + `useState(() => rehydrate())` from `App.tsx`
> - `onUpdate` propagation: see `GrpcWorkspace` → `setGrpcRequest` in `App.tsx`
> - Badge system: `requestBadgeInfo()` in `src/ui/src/lib/colors.ts`






- [ ] **T-193** UI: `RealtimeWorkspace` shell + save/load + state persistence
  - **File: `src/ui/src/components/RealtimeWorkspace.tsx`** (NEW, <160 lines)
  - Props: `{ initialRequest?: any; onUpdate?: (state: any) => void }`
  - Uses `useRealtimeTabs()` from T-189
  - Sidebar-click handling: `useRef` identity check (`_collection::name`) → `updateTab(activeTabId, { url, protocol, realtime, name, _collection })` if same tab or `addTab` if new
  - Debounced `onUpdate?.(activeTab)` (600ms) for refresh persistence
  - Layout: `flex` `h-full`
    - Left aside `w-64`: `<RealtimeCollectionsPanel onSelectRequest={handleSidebarSelect} onNewTab={protocol => addTab(protocol)} activeProtocol={activeTab.protocol} />`
    - Right `flex-1 flex flex-col`:
      - `<RealtimeTabBar tabs={tabs} activeTabId={activeTabId} onSelect={setActiveTabId} onClose={closeTab} onNew={addTab} />`
      - Protocol panel `flex-1 min-h-0`: switch on `activeTab.protocol` → `<WebSocketPanel>` / `<SSEPanel>` / `<SocketIOPanel>` / `<MQTTPanel>`. Pass `tab={activeTab}`, `onTabUpdate={u => updateTab(activeTabId, u)}`, `onSave={handleSave}`.
  - **Save flow**: `handleSave()`:
    - Already saved (`activeTab._collection && activeTab.name`): calls `updateRequest(col, name, { type: activeTab.protocol, url: activeTab.url, name: activeTab.name, realtime: activeTab.realtime })` from `../api`, flashes inline "Saved" for 2s.
    - Not saved: shows modal (collection select + name input). On submit: `addRequest(col, { type: activeTab.protocol, url, name, realtime: config })`. On success: `updateTab(activeTabId, { name, _collection: col })`, dispatch `reqly-reload`, close modal.
  - **Collection YAML guard**: Check `src/engine/collection-manager.ts` - if `addRequest` validates/filters `method` and rejects non-HTTP-method values, fix the guard to allow realtime types. The `type` field should be preserved as-is in YAML.
  - **After all sub-tasks**: `npm test` (all pass), `npm run build` in `src/ui/`, copy `dist/ui/` → `dist/ui`, restart. Manual tests:
    1. Open Realtime workspace → WebSocket tab → connect `wss://echo.websocket.org` → send "hello" → see echo in log
    2. SSE tab → connect `https://sse.dev/test` → see streaming events
    3. Save a WebSocket request to a collection → refresh page → same tab visible → click in Collections panel → routes to Realtime workspace
    4. MCP: call `run_realtime` with `type: websocket`, `url: wss://echo.websocket.org`, `sendMessages: [{message: "ping"}]`, `captureTimeout: 3` → returns `{ messages: [{source: 'server', payload: 'ping'}], truncated: false }`

### Protocol Expansion (Later)

- [ ] **T-151** ~~WebSocket / SSE support~~ - superseded by T-185 to T-193 above
