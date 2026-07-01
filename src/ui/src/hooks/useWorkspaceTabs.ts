import { useState, useEffect, useRef } from 'react';

export interface WorkspaceTab {
  id: string;
  tabName?: string;
  protocol: string;
  url: string;
  realtime?: any;
  graphql?: any;
  grpc?: any;
  headers?: any;
  name?: string;
  _collection?: string;
}

export function useWorkspaceTabs(namespace: string, defaultProtocol: string, defaultTabName: string) {
  const TABS_KEY = `reqly.${namespace}Tabs`;
  const ACTIVE_TAB_KEY = `reqly.${namespace}ActiveTabId`;

  const [tabs, setTabs] = useState<WorkspaceTab[]>(() => {
    try {
      const stored = localStorage.getItem(TABS_KEY);
      if (stored) return JSON.parse(stored);
    } catch {}
    return [{ id: `${namespace}-default`, protocol: defaultProtocol, url: '', tabName: defaultTabName }];
  });

  const [activeTabId, setActiveTabId] = useState<string>(() => {
    return localStorage.getItem(ACTIVE_TAB_KEY) || tabs[0]?.id || `${namespace}-default`;
  });

  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      localStorage.setItem(TABS_KEY, JSON.stringify(tabs));
      localStorage.setItem(ACTIVE_TAB_KEY, activeTabId);
    }, 300);
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, [tabs, activeTabId]);

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];

  const addTab = (protocol: string, name?: string) => {
    const newTab: WorkspaceTab = {
      id: `${namespace}-` + Date.now(),
      protocol,
      url: '',
      tabName: name || `New ${protocol.toUpperCase()}`,
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
  };

  const closeTab = (id: string) => {
    if (tabs.length === 1) return; // never close last tab
    
    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === id);
      const nextTabs = prev.filter(t => t.id !== id);
      if (id === activeTabId) {
        const nextActive = nextTabs[Math.max(0, idx - 1)]?.id || nextTabs[0]?.id;
        setActiveTabId(nextActive);
      }
      return nextTabs;
    });
  };

  const updateTab = (id: string, updates: Partial<WorkspaceTab>) => {
    setTabs(prev => prev.map(t => (t.id === id ? { ...t, ...updates } : t)));
  };

  const loadTab = (req: any) => {
    const existing = tabs.find(t => t.id === req.id || (t._collection === req._collection && t.name === req.name));
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }
    const newTab: WorkspaceTab = {
      id: req.id || `${namespace}-` + Date.now(),
      protocol: req.type as string,
      url: req.url || '',
      tabName: req.name,
      name: req.name,
      _collection: req._collection,
      realtime: req.realtime,
      graphql: req.graphql,
      grpc: req.grpc,
      headers: req.headers,
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
  };

  return {
    tabs,
    activeTabId,
    activeTab,
    addTab,
    closeTab,
    updateTab,
    loadTab,
    setActiveTabId,
  };
}
