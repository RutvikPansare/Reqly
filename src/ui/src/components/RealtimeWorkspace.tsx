import { useEffect, useRef, useState } from 'react';
import { CollectionsPanel } from './CollectionsPanel/index.js';
import { WorkspaceTabBar } from './WorkspaceTabBar.js';
import { WebSocketPanel } from './WebSocketPanel.js';
import { SSEPanel } from './SSEPanel.js';
import { SocketIOPanel } from './SocketIOPanel.js';
import { MQTTPanel } from './MQTTPanel.js';
import { useWorkspaceTabs } from '../hooks/useWorkspaceTabs.js';
import { SaveToCollectionModal } from './SaveToCollectionModal.js';
import { updateRequest } from '../api.js';
import { useAvailableVariables } from '../hooks/useAvailableVariables.js';
import { useVarCompletion } from '../hooks/useVarCompletion.js';
import { ResizablePanel } from './ResizablePanel.js';

export function RealtimeWorkspace({ initialRequest, onUpdate }: { initialRequest?: any; onUpdate?: (state: any) => void }) {
  const { tabs, activeTabId, activeTab, addTab, closeTab, updateTab, loadTab, setActiveTabId } = useWorkspaceTabs('realtime', 'websocket', 'New WebSocket');
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const availableVariables = useAvailableVariables(activeTab?._collection);
  const varCompletionExtension = useVarCompletion(availableVariables);
  const prevRequestIdRef = useRef<string | null>(null);
  const onUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Snapshot of the last-persisted url+realtime for the active saved request.
  // Used to detect whether anything changed before showing the Saved flash.
  const savedSnapshotRef = useRef<{ url: string; realtime: any } | null>(null);

  useEffect(() => {
    // Only react to sidebar-selected requests (must have _collection + name).
    if (!initialRequest?._collection || !initialRequest?.name) return;
    const identity = `${initialRequest._collection}::${initialRequest.name}`;
    if (identity === prevRequestIdRef.current) return;
    prevRequestIdRef.current = identity;
    savedSnapshotRef.current = { url: initialRequest.url || '', realtime: initialRequest.realtime ?? {} };
    loadTab(initialRequest);
  }, [initialRequest]);

  useEffect(() => {
    if (!activeTab || !onUpdate) return;
    if (onUpdateTimerRef.current) clearTimeout(onUpdateTimerRef.current);
    onUpdateTimerRef.current = setTimeout(() => onUpdate(activeTab), 600);
    return () => {
      if (onUpdateTimerRef.current) clearTimeout(onUpdateTimerRef.current);
    };
  }, [activeTab, onUpdate]);

  const isDirty = () => {
    if (!activeTab?._collection) return true; // unsaved tab, always needs save modal
    const snap = savedSnapshotRef.current;
    if (!snap) return true;
    return snap.url !== (activeTab.url || '') ||
      JSON.stringify(snap.realtime ?? {}) !== JSON.stringify(activeTab.realtime ?? {});
  };

  const flashSaved = () => { setSavedFlash(true); setTimeout(() => setSavedFlash(false), 2000); };

  const handleSave = async () => {
    if (activeTab._collection && (activeTab.name || activeTab.tabName)) {
      if (!isDirty()) return; // nothing changed, skip silently
      try {
        await updateRequest(activeTab._collection, activeTab.name || activeTab.tabName || '', { name: activeTab.name || activeTab.tabName, type: activeTab.protocol, url: activeTab.url, realtime: activeTab.realtime });
        savedSnapshotRef.current = { url: activeTab.url || '', realtime: activeTab.realtime ?? {} };
        window.dispatchEvent(new Event('reqly-reload'));
        flashSaved();
      } catch (e: any) {
        alert(e.message || 'Failed to update request');
      }
      return;
    }
    setSaveModalOpen(true);
  };

  const handleSaved = (collectionName: string, requestName: string, requestId?: string) => {
    updateTab(activeTabId, { name: requestName, _collection: collectionName, tabName: requestName, id: requestId || activeTab?.id });
    savedSnapshotRef.current = { url: activeTab?.url || '', realtime: activeTab?.realtime ?? {} };
    setSaveModalOpen(false);
    flashSaved();
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('reqly-request-saved', { detail: { col: collectionName } }));
    }, 100);
  };

  const props = activeTab && { tab: activeTab, onTabUpdate: (updates: any) => updateTab(activeTabId, updates), onSave: handleSave, flashSaved: savedFlash, isDirty: isDirty(), varCompletionExtension, availableVariables };

  return (
    <div className="flex h-full w-full overflow-hidden">
      <ResizablePanel defaultWidth={288} storageKey="reqly:realtime-sidebar-width" className="flex-col" style={{ background: 'var(--surface-1)' }}>
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
          <CollectionsPanel activeRequest={activeTab} onSelectRequest={(req, col) => loadTab({ ...req, _collection: col })} onRunCollection={() => {}} typeFilter={['websocket', 'sse', 'socketio', 'mqtt']} defaultRequestType="websocket" />
        </div>
      </ResizablePanel>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <WorkspaceTabBar tabs={tabs} activeTabId={activeTabId} onSelect={setActiveTabId} onClose={closeTab} onNew={addTab} protocols={[{ id: 'websocket', label: 'WebSocket' }, { id: 'sse', label: 'Server-Sent Events' }, { id: 'socketio', label: 'Socket.IO' }, { id: 'mqtt', label: 'MQTT' }]} />
        <div className="relative min-h-0 flex-1">
          {/* key by tab id: switching between two same-protocol tabs must
              remount the panel so its unmount cleanup closes the previous
              tab's live connection and resets messages/status. Without it,
              React reuses the instance and the old socket leaks with its
              messages bleeding into the new tab. */}
          {activeTab?.protocol === 'websocket' && props && <WebSocketPanel key={activeTabId} {...props} />}
          {activeTab?.protocol === 'sse' && props && <SSEPanel key={activeTabId} {...props} />}
          {activeTab?.protocol === 'socketio' && props && <SocketIOPanel key={activeTabId} {...props} />}
          {activeTab?.protocol === 'mqtt' && props && <MQTTPanel key={activeTabId} {...props} />}
        </div>
        {saveModalOpen && <SaveToCollectionModal request={{ type: activeTab?.protocol || 'websocket', url: activeTab?.url || '', realtime: activeTab?.realtime || {} }} defaultName={activeTab?.tabName || ''} onClose={() => setSaveModalOpen(false)} onSaved={handleSaved} />}
      </div>
    </div>
  );
}
