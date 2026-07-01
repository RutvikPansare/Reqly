import { useState, useEffect, useRef } from 'react';

export interface RealtimeTab {
  id: string;
  tabName?: string;
  protocol: 'websocket' | 'sse' | 'socketio' | 'mqtt';
  url: string;
  realtime?: any;
  name?: string;
  _collection?: string;
}

const TABS_KEY = 'reqly.realtimeTabs';
const ACTIVE_TAB_KEY = 'reqly.realtimeActiveTabId';

export function useRealtimeTabs() {
  const [tabs, setTabs] = useState<RealtimeTab[]>(() => {
    try {
      const stored = localStorage.getItem(TABS_KEY);
      if (stored) return JSON.parse(stored);
    } catch {}
    return [{ id: 'rt-default', protocol: 'websocket', url: '', tabName: 'New WebSocket' }];
  });

  const [activeTabId, setActiveTabId] = useState<string>(() => {
    return localStorage.getItem(ACTIVE_TAB_KEY) || tabs[0]?.id || 'rt-default';
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

  const addTab = (protocol: string) => {
    let defaultTabName = 'New WebSocket';
    if (protocol === 'sse') defaultTabName = 'New SSE';
    if (protocol === 'socketio') defaultTabName = 'New Socket.IO';
    if (protocol === 'mqtt') defaultTabName = 'New MQTT';

    const newTab: RealtimeTab = {
      id: 'rt-' + Date.now(),
      protocol: protocol as any,
      url: '',
      tabName: defaultTabName,
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

  const updateTab = (id: string, updates: Partial<RealtimeTab>) => {
    setTabs(prev => prev.map(t => (t.id === id ? { ...t, ...updates } : t)));
  };

  const loadTab = (req: any) => {
    const existing = tabs.find(t => t.id === req.id || (t._collection === req._collection && t.name === req.name));
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }
    const newTab: RealtimeTab = {
      id: req.id || 'rt-' + Date.now(),
      protocol: req.type as any,
      url: req.url || '',
      tabName: req.name,
      name: req.name,
      _collection: req._collection,
      realtime: req.realtime || {}
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
