import { useState, useEffect, useRef } from 'react';
import { Search, Settings, ChevronLeft, ChevronRight, X, Plus } from 'lucide-react';
import { updateRequest, fetchCollections, addRequest } from './api';
import { methodColorClass } from './lib/colors';
import { useLocalStorage } from './hooks/useLocalStorage';
import { NavRail } from './components/NavRail';
import type { NavPanel } from './components/NavRail';
import { CollectionsPanel } from './components/CollectionsPanel';
import { EnvironmentsPanel } from './components/EnvironmentsPanel';
import { HistoryPanel } from './components/HistoryPanel';
import { CapturePanel } from './components/CapturePanel';
import { SpotlightSearch } from './components/SpotlightSearch';
import { RequestEditor } from './components/RequestEditor';
import { ResponseViewer } from './components/ResponseViewer';
import { EnvironmentSwitcher } from './components/EnvironmentSwitcher';
import { SettingsPanel } from './components/SettingsPanel';
import { CollectionRunnerPanel } from './components/CollectionRunnerPanel';
import { GraphQLWorkspace } from './components/GraphQLWorkspace';
import { SaveToCollectionModal } from './components/SaveToCollectionModal';
import { SplitPane } from './components/SplitPane';

interface TabData {
  id: string;
  request: any;
  savedRequest: any;
  response: any;
  isSending: boolean;
}

const isDirty = (tab: TabData): boolean => {
  if (!tab.savedRequest) return false;
  const a = { ...tab.request };
  const b = { ...tab.savedRequest };
  // _collection is UI-only metadata, ignore in comparison.
  delete a._collection; delete b._collection;
  delete a.response; delete b.response;
  return JSON.stringify(a) !== JSON.stringify(b);
};

const makeTab = (request: any): TabData => ({
  id: '',
  request,
  savedRequest: JSON.parse(JSON.stringify(request)),
  response: null,
  isSending: false
});

const TABS_KEY = 'reqly.tabs';
const ACTIVE_TAB_KEY = 'reqly.activeTabId';
const ACTIVE_PANEL_KEY = 'reqly.activePanel';

// Strip ephemeral and sensitive data before writing tabs to localStorage.
// Response bodies are large/ephemeral; auth credentials are sensitive.
const sanitizeTab = (tab: TabData) => {
  const req = { ...tab.request };
  if (req.auth?.credentials) req.auth = { ...req.auth, credentials: undefined };
  return { id: tab.id, request: req };
};

const rehydrateTabs = (): TabData[] => {
  try {
    const raw = localStorage.getItem(TABS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<{ id: string; request: any }>;
    return parsed.map(t => {
      const tab = makeTab(t.request);
      tab.id = t.id;
      return tab;
    });
  } catch {
    return [];
  }
};

function App() {
  const [showSettings, setShowSettings] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [activePanel, setActivePanel] = useLocalStorage<NavPanel>(ACTIVE_PANEL_KEY, 'collections');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearch(s => !s);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const [tabs, setTabs] = useState<TabData[]>(() => {
    const restored = rehydrateTabs();
    if (restored.length > 0) return restored;
    const t = makeTab({ name: 'New Request', method: 'GET', url: 'https://jsonplaceholder.typicode.com/todos/1' });
    t.id = 'default';
    return [t];
  });
  const [activeTabId, setActiveTabId] = useLocalStorage<string>(ACTIVE_TAB_KEY, tabs[0]?.id || 'default');
  const [runningCollection, setRunningCollection] = useState<string | null>(null);
  const [saveModal, setSaveModal] = useState<{ tabId: string; request: any } | null>(null);
  const tabBarRef = useRef<HTMLDivElement>(null);

  // Persist sanitized tabs (debounced).
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(TABS_KEY, JSON.stringify(tabs.map(sanitizeTab)));
      } catch {
        // ignore quota errors
      }
    }, 300);
    return () => { if (persistTimer.current) clearTimeout(persistTimer.current); };
  }, [tabs]);

  const scrollTabs = (dir: 'left' | 'right') => {
    const el = tabBarRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === 'left' ? -200 : 200, behavior: 'smooth' });
  };

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];

  const updateTab = (id: string, updates: Partial<TabData>) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  };

  const closeTab = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (tabs.length === 1) {
      // Don't close the last tab, just reset it
      const id = 'default-' + Date.now();
      const t = makeTab({ name: 'New Request', method: 'GET', url: '' });
      t.id = id;
      setTabs([t]);
      setActiveTabId(id);
      return;
    }
    
    const newTabs = tabs.filter(t => t.id !== id);
    if (activeTabId === id) {
      setActiveTabId(newTabs[newTabs.length - 1].id);
    }
    setTabs(newTabs);
  };

  const handleFire = async (req: any, tabId: string) => {
    updateTab(tabId, { isSending: true });
    try {
      const res = await fetch('/api/run/adhoc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request: req })
      });
      const data = await res.json();
      if (data.response) {
        updateTab(tabId, { response: { ...data.response, assertions: data.assertions, diff: data.diff } });
      } else {
        updateTab(tabId, { response: { status: 500, latency: 0, body: data.error, headers: {} } });
      }
    } catch (e: any) {
      updateTab(tabId, { response: { status: 500, latency: 0, body: e.message, headers: {} } });
    } finally {
      updateTab(tabId, { isSending: false });
      window.dispatchEvent(new Event('reqly-reload'));
    }
  };

  const handleSelectRequestFromSidebar = (req: any, col: string) => {
    const tabId = `${col}-${req.name}`;
    const existing = tabs.find(t => t.id === tabId);
    if (existing) {
      setActiveTabId(tabId);
    } else {
      const t = makeTab({ ...req, _collection: col });
      t.id = tabId;
      setTabs([...tabs, t]);
      setActiveTabId(tabId);
    }
  };

  const createNewTab = () => {
    const newId = 'req-' + Date.now();
    const t = makeTab({ name: 'New Request', method: 'GET', url: '' });
    t.id = newId;
    setTabs([...tabs, t]);
    setActiveTabId(newId);
  };

  const onSelectCaptured = (req: any) => {
    // Open a captured request in a new tab and surface the editor.
    const tabId = `captured-${Date.now()}`;
    const t = makeTab({ ...req, _collection: 'captured' });
    t.id = tabId;
    setTabs(prev => [...prev, t]);
    setActiveTabId(tabId);
  };

  return (
    <div className="h-screen flex flex-col relative overflow-hidden">
      <header className="h-14 border-b border-gray-800 bg-gray-950 flex items-center px-4 shrink-0 gap-4">
        <h1 className="font-semibold tracking-wide shrink-0">Reqly</h1>
        <button
          onClick={() => setShowSearch(true)}
          className="bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 flex items-center gap-2 text-sm text-zinc-400 w-72 cursor-pointer hover:border-zinc-500 transition-colors"
          title="Search (Cmd+K)"
        >
          <Search size={16} />
          <span className="flex-1 text-left">Search</span>
          <span className="text-[10px] text-zinc-600">⌘K</span>
        </button>
        <div className="flex items-center gap-4 ml-auto">
          <EnvironmentSwitcher />
          <button
            onClick={() => setShowSettings(true)}
            className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-800 transition-colors"
            title="Settings"
          >
            <Settings size={18} />
          </button>
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden min-h-0">
        <NavRail
          active={activePanel}
          onSelect={(panel) => {
            if (panel === 'settings') {
              setShowSettings(true);
            } else {
              setActivePanel(panel);
            }
          }}
        />
        {activePanel !== 'graphql' && (
          <aside className="w-64 border-r border-gray-800 bg-gray-900 flex flex-col overflow-hidden min-h-0">
            <div className="flex-1 overflow-y-auto min-h-0">
              {activePanel === 'collections' && (
                <CollectionsPanel
                  activeRequest={activeTab?.request}
                  onSelectRequest={handleSelectRequestFromSidebar}
                  onRunCollection={setRunningCollection}
                />
              )}
              {activePanel === 'environments' && <EnvironmentsPanel />}
              {activePanel === 'history' && (
                <HistoryPanel onSelectRequest={handleSelectRequestFromSidebar} />
              )}
              {activePanel === 'capture' && (
                <CapturePanel onSelectCaptured={(req) => onSelectCaptured(req)} />
              )}
            </div>
            {/* Environment switcher pinned at the bottom of the sidebar */}
            <div className="border-t border-gray-800 px-3 py-2 shrink-0">
              <EnvironmentSwitcher />
            </div>
          </aside>
        )}

        <main className="flex-1 bg-gray-950 overflow-hidden flex flex-col min-h-0 relative">
          {activePanel === 'graphql' ? (
            <GraphQLWorkspace />
          ) : (
            <>
              <div className="flex items-center bg-gray-900 border-b border-gray-800 shrink-0">
                <button
                  onClick={() => scrollTabs('left')}
                  className="px-1.5 py-2 text-gray-500 hover:text-white hover:bg-gray-800 shrink-0"
                  title="Scroll left"
                >
                  <ChevronLeft size={16} />
                </button>
                <div ref={tabBarRef} className="flex overflow-x-auto flex-1" style={{ scrollbarWidth: 'none' }}>
                  {tabs.map(tab => {
                    const isActive = activeTabId === tab.id;
                    const dirty = isDirty(tab);
                    return (
                      <div
                        key={tab.id}
                        onClick={() => setActiveTabId(tab.id)}
                        className={`relative flex items-center gap-2 px-3 py-2 border-r border-gray-800 cursor-pointer min-w-32 max-w-48 group ${isActive ? 'bg-gray-800' : 'hover:bg-gray-800/50'}`}
                      >
                        {isActive && (
                          <span className="absolute left-0 bottom-0 right-0 h-0.5 bg-blue-500" aria-hidden="true" />
                        )}
                        <span className={`text-xs font-bold ${methodColorClass(tab.request.method)}`}>
                          {tab.request.method}
                        </span>
                        <span className="text-sm text-gray-300 truncate flex-1">
                          {tab.request.name || 'Untitled'}
                        </span>
                        <div className="w-5 h-5 flex items-center justify-center shrink-0 relative">
                          {dirty && (
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 group-hover:hidden" title="Unsaved changes" />
                          )}
                          <button
                            onClick={(e) => closeTab(e, tab.id)}
                            className={`text-gray-500 hover:text-red-400 p-0.5 rounded ${dirty ? 'hidden group-hover:block' : 'opacity-0 group-hover:opacity-100'} transition-opacity absolute inset-0`}
                          >
                            <X size={16} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  <button
                    onClick={createNewTab}
                    className="px-3 hover:bg-gray-800 text-gray-400 hover:text-white border-r border-gray-800 shrink-0"
                    title="New Tab"
                  >
                    <Plus size={16} />
                  </button>
                </div>
                <button
                  onClick={() => scrollTabs('right')}
                  className="px-1.5 py-2 text-gray-500 hover:text-white hover:bg-gray-800 shrink-0"
                  title="Scroll right"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              <div className="flex-1 overflow-hidden relative">
                {tabs.map(tab => (
                  <div
                    key={tab.id}
                    className="absolute inset-0 p-4 overflow-hidden"
                    style={{ display: activeTabId === tab.id ? 'flex' : 'none', flexDirection: 'column' }}
                  >
                    <SplitPane
                      top={
                        <RequestEditor
                          request={tab.request}
                          onFire={(req) => handleFire(req, tab.id)}
                          onChange={(req) => updateTab(tab.id, { request: { ...req, _collection: tab.request._collection } })}
                          onSave={async (req) => {
                            if (tab.request._collection) {
                              try {
                                await updateRequest(tab.request._collection, tab.request.name, req);
                                const saved = { ...req, _collection: tab.request._collection };
                                updateTab(tab.id, { request: saved, savedRequest: JSON.parse(JSON.stringify(saved)) });
                                window.dispatchEvent(new Event('reqly-reload'));
                              } catch (e) {
                                console.error("Failed to save request", e);
                                alert("Failed to save request.");
                              }
                            } else {
                              const cols = await fetchCollections();
                              const hasCustomName = req.name && req.name !== 'New Request';
                              if (cols.length === 1 && hasCustomName) {
                                try {
                                  const requestToSave = { ...req };
                                  if (!requestToSave.id) requestToSave.id = Date.now().toString();
                                  await addRequest(cols[0].name, requestToSave);
                                  const saved = { ...requestToSave, _collection: cols[0].name };
                                  const newTabId = `${cols[0].name}-${requestToSave.name}`;
                                  setTabs(prev => prev.map(t => t.id === tab.id ? { ...t, id: newTabId, request: saved, savedRequest: JSON.parse(JSON.stringify(saved)) } : t));
                                  if (activeTabId === tab.id) setActiveTabId(newTabId);
                                  window.dispatchEvent(new Event('reqly-reload'));
                                } catch (e) {
                                  console.error('Failed to save request', e);
                                  alert('Failed to save request.');
                                }
                              } else {
                                setSaveModal({ tabId: tab.id, request: req });
                              }
                            }
                          }}
                        />
                      }
                      bottom={<ResponseViewer response={tab.response} isSending={tab.isSending} />}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </main>
      </div>
      {showSearch && (
        <SpotlightSearch
          onSelectRequest={handleSelectRequestFromSidebar}
          onClose={() => setShowSearch(false)}
        />
      )}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      {runningCollection && (
        <CollectionRunnerPanel collectionName={runningCollection} onClose={() => setRunningCollection(null)} />
      )}
      {saveModal && (
        <SaveToCollectionModal
          request={saveModal.request}
          defaultName={saveModal.request.name || 'New Request'}
          onClose={() => setSaveModal(null)}
          onSaved={(collectionName, requestName, requestId) => {
            const saved = { ...saveModal.request, _collection: collectionName, name: requestName };
            if (requestId) saved.id = requestId;
            const newTabId = `${collectionName}-${requestName}`;
            setTabs(prev => prev.map(t => t.id === saveModal.tabId ? { ...t, id: newTabId, request: saved, savedRequest: JSON.parse(JSON.stringify(saved)) } : t));
            if (activeTabId === saveModal.tabId) setActiveTabId(newTabId);
            setSaveModal(null);
          }}
        />
      )}
    </div>
  );
}

export default App;
