import { useState, useEffect, useRef } from 'react';
import { Search, Settings, ChevronLeft, ChevronRight, X, Plus, ChevronDown } from 'lucide-react';
import { updateRequest, fetchCollections, addRequest, fetchEnvironments, setActiveEnvironment } from './api';
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
import { SettingsPanel } from './components/SettingsPanel';
import { CollectionRunnerPanel } from './components/CollectionRunnerPanel';
import { GraphQLWorkspace } from './components/GraphQLWorkspace';
import { FlowsPanel } from './components/FlowsPanel';
import { FlowWorkspace } from './components/FlowWorkspace';
import { SaveToCollectionModal } from './components/SaveToCollectionModal';
import { SplitPane } from './components/SplitPane';
import { BottomBar, BottomPanel, useConsoleStats } from './components/BottomPanel';

interface TabData {
  id: string;
  tabName?: string;
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
  return { id: tab.id, tabName: tab.tabName, request: req };
};

const rehydrateTabs = (): TabData[] => {
  try {
    const raw = localStorage.getItem(TABS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<{ id: string; tabName?: string; request: any }>;
    return parsed.map(t => {
      const tab = makeTab(t.request);
      tab.id = t.id;
      if (t.tabName) tab.tabName = t.tabName;
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
  const [bottomOpen, setBottomOpen] = useState(false);
  const [bottomHeight, setBottomHeight] = useState(220);
  const tabBarRef = useRef<HTMLDivElement>(null);
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renameTabValue, setRenameTabValue] = useState('');
  const [selectedFlowName, setSelectedFlowName] = useState<string | null>(null);
  const [flowLastResults, setFlowLastResults] = useState<Record<string, any>>({});

  const startTabRename = (id: string, currentName: string) => {
    setRenamingTabId(id);
    setRenameTabValue(currentName);
  };

  const commitTabRename = (id: string) => {
    const name = renameTabValue.trim();
    if (name) {
      setTabs(prev => prev.map(t => t.id === id ? { ...t, tabName: name } : t));
    }
    setRenamingTabId(null);
    setRenameTabValue('');
  };

  // Compact header env selector state
  const [headerEnvs, setHeaderEnvs] = useState<any[]>([]);
  const [headerActiveEnv, setHeaderActiveEnv] = useState<string | null>(null);
  const [headerEnvOpen, setHeaderEnvOpen] = useState(false);
  const headerEnvRef = useRef<HTMLDivElement>(null);

  const loadHeaderEnvs = () => {
    fetchEnvironments().then(data => {
      setHeaderEnvs(data.environments || []);
      setHeaderActiveEnv(data.active || null);
    }).catch(console.error);
  };

  useEffect(() => {
    loadHeaderEnvs();
    window.addEventListener('reqly-reload', loadHeaderEnvs);
    const onClickOutside = (e: MouseEvent) => {
      if (headerEnvRef.current && !headerEnvRef.current.contains(e.target as Node)) {
        setHeaderEnvOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      window.removeEventListener('reqly-reload', loadHeaderEnvs);
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, []);

  const handleHeaderEnvSelect = async (name: string) => {
    await setActiveEnvironment(name).catch(console.error);
    setHeaderActiveEnv(name);
    setHeaderEnvOpen(false);
    window.dispatchEvent(new Event('reqly-reload'));
  };

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

  // Keyboard shortcut: Ctrl+` to toggle bottom panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '`' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setBottomOpen(o => !o);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const scrollTabs = (dir: 'left' | 'right') => {
    const el = tabBarRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === 'left' ? -200 : 200, behavior: 'smooth' });
  };

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];
  const consoleStats = useConsoleStats();

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
        updateTab(tabId, { response: { ...data.response, assertions: data.assertions, diff: data.diff, contractViolations: data.contractViolations, contractMatch: data.contractMatch } });
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
    if (req._isExample) {
      // Open (or focus) the parent request tab and show the example's saved response.
      const tabId = `${col}-${req.name}`;
      const existing = tabs.find(t => t.id === tabId);
      if (existing) {
        updateTab(tabId, { response: req._exampleResponse });
        setActiveTabId(tabId);
      } else {
        const parentReq = { ...req };
        delete parentReq._isExample;
        delete parentReq._exampleId;
        delete parentReq._exampleResponse;
        const t = makeTab({ ...parentReq, _collection: col });
        t.id = tabId;
        t.response = req._exampleResponse;
        setTabs(prev => [...prev, t]);
        setActiveTabId(tabId);
      }
      return;
    }
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
    <div className="h-screen flex flex-col relative" style={{ background: 'var(--surface-1)', overflow: 'hidden' }}>
      {/* Main area: header + sidebar/content - flex-1 so bottom bar is never squeezed out */}
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <header className="relative flex items-center px-4 shrink-0" style={{ height: '48px', background: 'var(--surface-0)', borderBottom: '1px solid var(--border)' }}>
        {/* Wordmark - left */}
        <h1
          className="shrink-0 select-none"
          style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif", fontWeight: 800, fontSize: '1.1rem', letterSpacing: '-0.04em', color: '#e4e4e7', lineHeight: 1 }}
        >
          Reqly
        </h1>

        {/* Search - absolutely centered */}
        <button
          onClick={() => setShowSearch(true)}
          className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 cursor-pointer transition-colors px-3 rounded"
          style={{ height: '32px', width: '340px', background: 'var(--surface-3)', border: '1px solid var(--border-strong)', color: 'var(--text-muted)', fontSize: '0.8125rem' }}
          title="Search (Cmd+K)"
        >
          <Search size={13} />
          <span className="flex-1 text-left">Search</span>
          <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>⌘K</span>
        </button>
        <div className="flex items-center gap-2 ml-auto">
          {/* Compact env selector */}
          <div className="relative" ref={headerEnvRef}>
            <button
              onClick={() => setHeaderEnvOpen(o => !o)}
              className="flex items-center gap-2 rounded px-3 transition-colors shrink-0"
              style={{ height: '32px', background: 'var(--surface-3)', border: '1px solid var(--border-strong)', color: 'var(--text-secondary)', fontSize: '0.8125rem' }}
              title="Switch environment"
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: headerActiveEnv ? '#4ade80' : 'var(--border-strong)' }}
              />
              <span className="max-w-28 truncate">{headerActiveEnv || 'No env'}</span>
              <ChevronDown size={12} style={{ transform: headerEnvOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
            </button>
            {headerEnvOpen && (
              <div
                className="absolute right-0 top-full mt-1 rounded py-1 z-50 min-w-40"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border-strong)', boxShadow: '0 16px 48px rgba(0,0,0,0.5)' }}
              >
                {headerEnvs.map(env => (
                  <button
                    key={env.name}
                    onClick={() => handleHeaderEnvSelect(env.name)}
                    className="w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition-colors"
                    style={{ color: 'var(--text-secondary)', background: 'transparent' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: headerActiveEnv === env.name ? '#4ade80' : 'transparent', border: headerActiveEnv === env.name ? 'none' : '1px solid var(--border-strong)' }}
                    />
                    {env.name}
                  </button>
                ))}
                {headerEnvs.length === 0 && (
                  <div className="px-3 py-2 text-xs italic" style={{ color: 'var(--text-muted)' }}>No environments</div>
                )}
              </div>
            )}
          </div>
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center justify-center rounded transition-colors"
            style={{ width: '32px', height: '32px', color: 'var(--text-muted)', background: 'transparent', border: 'none' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-3)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'; }}
            title="Settings"
          >
            <Settings size={16} />
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
          <aside className="w-64 flex flex-col overflow-hidden min-h-0" style={{ background: 'var(--surface-2)', borderRight: '1px solid var(--border)' }}>
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
                <CapturePanel
                  onSelectCaptured={(req) => onSelectCaptured(req)}
                  onOpenCollection={(_col) => setActivePanel('collections')}
                />
              )}
              {activePanel === 'flows' && (
                <FlowsPanel
                  selectedFlow={selectedFlowName}
                  onSelectFlow={setSelectedFlowName}
                  lastResults={flowLastResults}
                />
              )}
            </div>
          </aside>
        )}

        <main className="flex-1 overflow-hidden flex flex-col min-h-0 relative" style={{ background: 'var(--surface-1)' }}>
          {activePanel === 'graphql' ? (
            <GraphQLWorkspace />
          ) : activePanel === 'flows' ? (
            selectedFlowName ? (
              <FlowWorkspace
                flowName={selectedFlowName}
                lastResult={flowLastResults[selectedFlowName] || null}
                onRunComplete={(name, result) => setFlowLastResults(prev => ({ ...prev, [name]: result }))}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
                Select a flow, or create one in the sidebar
              </div>
            )
          ) : (
            <>
              <div className="flex items-center shrink-0" style={{ height: '40px', background: 'var(--surface-0)', borderBottom: '1px solid var(--border)' }}>
                <button
                  onClick={() => scrollTabs('left')}
                  className="flex items-center justify-center shrink-0 transition-colors"
                  style={{ width: '28px', height: '40px', color: 'var(--text-muted)', background: 'transparent', border: 'none', borderRight: '1px solid var(--border)' }}
                  title="Scroll left"
                >
                  <ChevronLeft size={13} />
                </button>
                <div ref={tabBarRef} className="flex overflow-x-auto flex-1 h-full" style={{ scrollbarWidth: 'none' }}>
                  {tabs.map(tab => {
                    const isActive = activeTabId === tab.id;
                    const dirty = isDirty(tab);
                    const isRenaming = renamingTabId === tab.id;
                    const displayName = tab.tabName ?? tab.request.name ?? 'Untitled';
                    return (
                      <div
                        key={tab.id}
                        onClick={() => !isRenaming && setActiveTabId(tab.id)}
                        className="relative flex items-center gap-2 px-3 cursor-pointer min-w-32 max-w-44 group transition-colors h-full"
                        style={{
                          borderRight: '1px solid var(--border)',
                          background: isActive ? 'var(--surface-2)' : 'transparent',
                        }}
                      >
                        {isActive && (
                          <span className="absolute left-0 bottom-0 right-0 h-0.5 bg-blue-500" aria-hidden="true" />
                        )}
                        {tab.isSending ? (
                          <span className="relative flex shrink-0 items-center justify-center w-4 h-4">
                            <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-blue-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500" />
                          </span>
                        ) : (
                          <span className={`text-[10px] font-bold shrink-0 ${methodColorClass(tab.request.method)}`}>
                            {tab.request.method}
                          </span>
                        )}
                        {isRenaming ? (
                          <input
                            autoFocus
                            className="text-xs flex-1 bg-transparent outline-none border-b"
                            style={{ borderColor: 'var(--accent)', color: 'var(--text-primary)', minWidth: 0 }}
                            value={renameTabValue}
                            onChange={e => setRenameTabValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') commitTabRename(tab.id);
                              if (e.key === 'Escape') { setRenamingTabId(null); setRenameTabValue(''); }
                            }}
                            onBlur={() => commitTabRename(tab.id)}
                            onClick={e => e.stopPropagation()}
                          />
                        ) : (
                          <span
                            className="text-xs truncate flex-1"
                            style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                            onDoubleClick={e => { e.stopPropagation(); startTabRename(tab.id, displayName); }}
                            title="Double-click to rename"
                          >
                            {displayName}
                          </span>
                        )}
                        <div className="w-4 h-4 flex items-center justify-center shrink-0 relative">
                          {dirty && (
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 group-hover:hidden" title="Unsaved changes" />
                          )}
                          <button
                            onClick={(e) => closeTab(e, tab.id)}
                            className={`rounded ${dirty ? 'hidden group-hover:flex' : 'opacity-0 group-hover:opacity-100'} transition-opacity absolute inset-0 flex items-center justify-center`}
                            style={{ color: 'var(--text-muted)' }}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  <button
                    onClick={createNewTab}
                    className="flex items-center justify-center shrink-0 transition-colors h-full"
                    style={{ padding: '0 10px', color: 'var(--text-muted)', background: 'transparent', border: 'none', borderRight: '1px solid var(--border)' }}
                    title="New Tab"
                  >
                    <Plus size={13} />
                  </button>
                </div>
                <button
                  onClick={() => scrollTabs('right')}
                  className="flex items-center justify-center shrink-0 transition-colors"
                  style={{ width: '28px', height: '40px', color: 'var(--text-muted)', background: 'transparent', border: 'none', borderLeft: '1px solid var(--border)' }}
                  title="Scroll right"
                >
                  <ChevronRight size={13} />
                </button>
              </div>

              <div className="flex-1 overflow-hidden relative">
                {tabs.map(tab => (
                  <div
                    key={tab.id}
                    className="absolute inset-0 p-4 gap-0 overflow-hidden"
                    style={{ display: activeTabId === tab.id ? 'flex' : 'none', flexDirection: 'column' }}
                  >
                    <SplitPane
                      top={
                        <RequestEditor
                          isActive={activeTabId === tab.id}
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
                      bottom={<ResponseViewer response={tab.response} isSending={tab.isSending} request={tab.request} />}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </main>
      </div>
      </div>{/* end main flex area */}
      <BottomPanel
        open={bottomOpen}
        onClose={() => setBottomOpen(false)}
        height={bottomHeight}
        onHeightChange={setBottomHeight}
      />
      <BottomBar
        consoleOpen={bottomOpen}
        onToggleConsole={() => setBottomOpen(o => !o)}
        entryCount={consoleStats.total}
        errorCount={consoleStats.errors}
      />
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
