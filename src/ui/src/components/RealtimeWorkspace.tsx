import { useEffect, useRef, useState } from 'react';
import { CollectionsPanel } from './CollectionsPanel.js';
import { RealtimeTabBar } from './RealtimeTabBar.js';
import { WebSocketPanel } from './WebSocketPanel.js';
import { SSEPanel } from './SSEPanel.js';
import { SocketIOPanel } from './SocketIOPanel.js';
import { MQTTPanel } from './MQTTPanel.js';
import { useRealtimeTabs } from '../hooks/useRealtimeTabs.js';
import { SaveToCollectionModal } from './SaveToCollectionModal.js';
import { updateRequest } from '../api.js';

export function RealtimeWorkspace({ initialRequest, onUpdate }: { initialRequest?: any; onUpdate?: (state: any) => void }) {
  const { tabs, activeTabId, activeTab, addTab, closeTab, updateTab, loadTab, setActiveTabId } = useRealtimeTabs();
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const prevRequestIdRef = useRef<string | null>(null);
  const onUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Only react to sidebar-selected requests (must have _collection + name).
    // Ignoring onUpdate feedback (which lacks _collection or has a generated id but same name)
    // prevents the cycle: onUpdate → setRealtimeRequest → initialRequest change → loadTab → setActiveTabId switches tab.
    if (!initialRequest?._collection || !initialRequest?.name) return;
    const identity = `${initialRequest._collection}::${initialRequest.name}`;
    if (identity === prevRequestIdRef.current) return;
    prevRequestIdRef.current = identity;
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

  const flashSaved = () => { setSavedFlash(true); setTimeout(() => setSavedFlash(false), 2000); };

  const handleSave = async () => {
    if (activeTab._collection && (activeTab.name || activeTab.tabName)) {
      try {
        await updateRequest(activeTab._collection, activeTab.name || activeTab.tabName || '', { name: activeTab.name || activeTab.tabName, type: activeTab.protocol, url: activeTab.url, realtime: activeTab.realtime });
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
    updateTab(activeTabId, { _collection: collectionName, name: requestName, tabName: requestName, id: requestId || activeTab.id });
    setSaveModalOpen(false);
    flashSaved();
  };

  const props = activeTab && { tab: activeTab, onTabUpdate: (updates: any) => updateTab(activeTabId, updates), onSave: handleSave };

  return (
    <div className="flex h-full w-full overflow-hidden">
      <div className="w-72 shrink-0 border-r" style={{ borderColor: 'var(--border)' }}>
        <CollectionsPanel activeRequest={activeTab} onSelectRequest={(req, col) => loadTab({ ...req, _collection: col })} onRunCollection={() => {}} typeFilter={['websocket', 'sse', 'socketio', 'mqtt']} defaultRequestType="websocket" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <RealtimeTabBar tabs={tabs} activeTabId={activeTabId} onSelect={setActiveTabId} onClose={closeTab} onNew={addTab} />
        <div className="relative min-h-0 flex-1">
          {savedFlash && <div className="absolute top-2 right-3 z-50 rounded px-2 py-1 text-xs" style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)', color: '#4ade80' }}>Saved</div>}
          {activeTab?.protocol === 'websocket' && props && <WebSocketPanel {...props} />}
          {activeTab?.protocol === 'sse' && props && <SSEPanel {...props} />}
          {activeTab?.protocol === 'socketio' && props && <SocketIOPanel {...props} />}
          {activeTab?.protocol === 'mqtt' && props && <MQTTPanel {...props} />}
        </div>
        {saveModalOpen && <SaveToCollectionModal request={{ type: activeTab?.protocol || 'websocket', url: activeTab?.url || '', realtime: activeTab?.realtime || {} }} defaultName={activeTab?.tabName || ''} onClose={() => setSaveModalOpen(false)} onSaved={handleSaved} />}
      </div>
    </div>
  );
}
