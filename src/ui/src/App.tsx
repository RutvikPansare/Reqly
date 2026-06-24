import { useState, useEffect, useRef } from 'react';
import { updateRequest } from './api';
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
import { PromptBar } from './components/PromptBar';
import { CollectionRunnerPanel } from './components/CollectionRunnerPanel';

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

function App() {
  const [showSettings, setShowSettings] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [activePanel, setActivePanel] = useState<NavPanel>('collections');

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
    const t = makeTab({ name: 'New Request', method: 'GET', url: 'https://jsonplaceholder.typicode.com/todos/1' });
    t.id = 'default';
    return [t];
  });
  const [activeTabId, setActiveTabId] = useState<string>('default');
  const [runningCollection, setRunningCollection] = useState<string | null>(null);
  const tabBarRef = useRef<HTMLDivElement>(null);

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
        updateTab(tabId, { response: { ...data.response, assertions: data.assertions, previousResponse: data.previousResponse } });
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
      <header className="h-14 border-b border-gray-800 bg-gray-950 flex items-center justify-between px-4 shrink-0">
        <h1 className="font-semibold tracking-wide">Reqly</h1>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowSearch(true)}
            className="text-xs text-gray-400 hover:text-white px-3 py-1 rounded border border-gray-700 hover:bg-gray-800 transition-colors flex items-center gap-2"
            title="Search (Cmd+K)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            <span>Search</span>
            <span className="text-[10px] text-gray-600">⌘K</span>
          </button>
          <EnvironmentSwitcher />
          <button 
            onClick={() => setShowSettings(true)} 
            className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-800 transition-colors"
            title="Settings"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
              <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z"/>
              <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115l.094-.319z"/>
            </svg>
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
        <aside className="w-64 border-r border-gray-800 bg-gray-900 flex flex-col overflow-hidden min-h-0">
          <div className="flex-1 overflow-y-auto">
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
        </aside>

        <main className="flex-1 bg-gray-950 overflow-hidden flex flex-col min-h-0 relative">
          <div className="flex items-center bg-gray-900 border-b border-gray-800 shrink-0">
            <button
              onClick={() => scrollTabs('left')}
              className="px-1.5 py-2 text-gray-500 hover:text-white hover:bg-gray-800 shrink-0"
              title="Scroll left"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
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
                    <span className={`text-xs font-bold ${tab.request.method === 'GET' ? 'text-green-400' : tab.request.method === 'POST' ? 'text-yellow-400' : tab.request.method === 'DELETE' ? 'text-red-400' : 'text-blue-400'}`}>
                      {tab.request.method}
                    </span>
                    <span className="text-sm text-gray-300 truncate flex-1">
                      {tab.request.name || 'Untitled'}
                    </span>
                    {dirty && (
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0 group-hover:hidden" title="Unsaved changes" />
                    )}
                    <button
                      onClick={(e) => closeTab(e, tab.id)}
                      className={`text-gray-500 hover:text-red-400 p-0.5 rounded shrink-0 ${dirty ? 'hidden group-hover:block' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                  </div>
                );
              })}
              <button
                onClick={createNewTab}
                className="px-3 hover:bg-gray-800 text-gray-400 hover:text-white border-r border-gray-800 shrink-0"
                title="New Tab"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              </button>
            </div>
            <button
              onClick={() => scrollTabs('right')}
              className="px-1.5 py-2 text-gray-500 hover:text-white hover:bg-gray-800 shrink-0"
              title="Scroll right"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
          </div>

          <div className="flex-1 overflow-hidden relative">
            {tabs.map(tab => (
              <div 
                key={tab.id} 
                className="absolute inset-0 flex flex-col p-4 gap-4 overflow-hidden"
                style={{ display: activeTabId === tab.id ? 'flex' : 'none' }}
              >
                <div className="flex-1 min-h-0 flex flex-col">
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
                        alert("This request doesn't belong to a collection yet. Support for saving new requests coming soon.");
                      }
                    }}
                  />
                </div>
                <div className="flex-1 min-h-0 flex flex-col">
                  <ResponseViewer response={tab.response} isSending={tab.isSending} />
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
      <PromptBar activeRequest={activeTab?.request} />
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
    </div>
  );
}

export default App;
