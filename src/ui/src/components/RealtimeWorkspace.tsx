import { useEffect, useState } from 'react';
import { RealtimeCollectionsPanel } from './RealtimeCollectionsPanel';
import { RealtimeTabBar } from './RealtimeTabBar';
import { WebSocketPanel } from './WebSocketPanel';
import { SSEPanel } from './SSEPanel';
import { SocketIOPanel } from './SocketIOPanel';
import { MQTTPanel } from './MQTTPanel';
import { useRealtimeTabs } from '../hooks/useRealtimeTabs';
import { SaveToCollectionModal } from './SaveToCollectionModal';
import { updateRequest } from '../api';

export function RealtimeWorkspace({ initialRequest }: { initialRequest?: any }) {
  const { tabs, activeTabId, activeTab, addTab, closeTab, updateTab, loadTab, setActiveTabId } = useRealtimeTabs();
  const [saveModalOpen, setSaveModalOpen] = useState(false);

  useEffect(() => {
    if (initialRequest) {
      loadTab(initialRequest);
    }
  }, [initialRequest]);

  const handleSave = async () => {
    if (activeTab._collection) {
      try {
        const reqToSave = {
          id: activeTab.id,
          name: activeTab.name || activeTab.tabName,
          type: activeTab.protocol,
          url: activeTab.url,
          realtime: activeTab.realtime
        };
        await updateRequest(activeTab._collection, activeTab.name || activeTab.tabName || '', reqToSave);
        window.dispatchEvent(new Event('reqly-reload'));
      } catch (e: any) {
        alert(e.message || 'Failed to update request');
      }
    } else {
      setSaveModalOpen(true);
    }
  };

  const handleSaved = (collectionName: string, requestName: string, requestId?: string) => {
    updateTab(activeTabId, {
      _collection: collectionName,
      name: requestName,
      tabName: requestName,
      id: requestId || activeTab.id
    });
    setSaveModalOpen(false);
  };

  const renderActivePanel = () => {
    if (!activeTab) return null;
    const props = {
      tab: activeTab,
      onTabUpdate: (updates: any) => updateTab(activeTabId, updates),
      onSave: handleSave
    };

    switch (activeTab.protocol) {
      case 'websocket': return <WebSocketPanel {...props} />;
      case 'sse': return <SSEPanel {...props} />;
      case 'socketio': return <SocketIOPanel {...props} />;
      case 'mqtt': return <MQTTPanel {...props} />;
      default: return null;
    }
  };

  return (
    <div className="flex h-full overflow-hidden w-full">
      <div className="w-64 shrink-0 border-r" style={{ borderColor: 'var(--border)' }}>
        <RealtimeCollectionsPanel 
          onSelectRequest={(req, col) => loadTab({ ...req, _collection: col })}
          onNewTab={addTab}
        />
      </div>
      <div className="flex flex-col h-full overflow-hidden flex-1 min-w-0">
        <RealtimeTabBar 
          tabs={tabs}
          activeTabId={activeTabId}
          onSelect={setActiveTabId}
          onClose={closeTab}
          onNew={addTab}
        />
        <div className="flex-1 min-h-0 relative">
          {renderActivePanel()}
        </div>
        {saveModalOpen && (
          <SaveToCollectionModal
            request={{
              type: activeTab?.protocol || 'websocket',
              url: activeTab?.url || '',
              realtime: activeTab?.realtime || {}
            }}
            defaultName={activeTab?.tabName || ''}
            onClose={() => setSaveModalOpen(false)}
            onSaved={handleSaved}
          />
        )}
      </div>
    </div>
  );
}
