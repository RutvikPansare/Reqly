import { useState, useEffect } from 'react';
import { Folder, Globe, History, Network, GitBranch, Radio, Settings, Server, Wifi } from 'lucide-react';

export type NavPanel = 'collections' | 'environments' | 'history' | 'graphql' | 'grpc' | 'realtime' | 'flows' | 'capture' | 'settings';

interface NavRailProps {
  active: NavPanel;
  onSelect: (panel: NavPanel) => void;
}

interface NavItem {
  id: NavPanel;
  label: string;
  icon: React.ReactNode;
}

// Icons: 18px, Lucide React, matches Hoppscotch nav rail sizing.
// Active state: colored background chip + left accent bar.
const DEFAULT_NAV_ITEMS: NavItem[] = [
  { id: 'collections', label: 'Collections', icon: <Folder size={18} /> },
  { id: 'environments', label: 'Environments', icon: <Globe size={18} /> },
  { id: 'flows', label: 'Flows', icon: <GitBranch size={18} /> },
  { id: 'history', label: 'History', icon: <History size={18} /> },
  { id: 'graphql', label: 'GraphQL', icon: <Network size={18} /> },
  { id: 'grpc', label: 'gRPC', icon: <Server size={18} /> },
  { id: 'realtime', label: 'Realtime', icon: <Wifi size={18} /> },
  { id: 'capture', label: 'Capture', icon: <Radio size={18} /> },
  { id: 'settings', label: 'Settings', icon: <Settings size={18} /> },
];

export function NavRail({ active, onSelect }: NavRailProps) {
  const [items, setItems] = useState<NavItem[]>(DEFAULT_NAV_ITEMS);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  useEffect(() => {
    // 1. Try to load from localStorage for instant render
    const cached = localStorage.getItem('reqly.sidebarOrder');
    if (cached) {
      try {
        const order = JSON.parse(cached) as string[];
        if (Array.isArray(order) && order.length === DEFAULT_NAV_ITEMS.length) {
          const sorted = [...DEFAULT_NAV_ITEMS].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
          setItems(sorted);
        }
      } catch (e) {}
    }

    // 2. Fetch from backend config to sync across clients
    fetch('/api/config')
      .then(res => res.json())
      .then(data => {
        if (data && data.sidebarOrder && Array.isArray(data.sidebarOrder)) {
          const order = data.sidebarOrder;
          if (order.length === DEFAULT_NAV_ITEMS.length) {
            const sorted = [...DEFAULT_NAV_ITEMS].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
            setItems(sorted);
            localStorage.setItem('reqly.sidebarOrder', JSON.stringify(order));
          }
        }
      })
      .catch(console.error);
  }, []);

  const saveOrder = async (newItems: NavItem[]) => {
    const order = newItems.map(i => i.id);
    localStorage.setItem('reqly.sidebarOrder', JSON.stringify(order));
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sidebarOrder: order })
      });
    } catch (e) {
      console.error('Failed to save sidebar order', e);
    }
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    
    // Create a visual drag image (optional, browsers do this automatically but we can style it)
    setTimeout(() => setDraggedId(id), 0);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;

    const newItems = [...items];
    const draggedIdx = newItems.findIndex(i => i.id === draggedId);
    const targetIdx = newItems.findIndex(i => i.id === targetId);
    
    if (draggedIdx === -1 || targetIdx === -1) return;

    const [draggedItem] = newItems.splice(draggedIdx, 1);
    newItems.splice(targetIdx, 0, draggedItem);
    
    setItems(newItems);
    saveOrder(newItems);
    setDraggedId(null);
  };

  return (
    <nav className="w-12 shrink-0 flex flex-col items-center py-2 gap-1" style={{ background: 'var(--surface-1)', borderRight: '1px solid var(--border)' }}>
      {items.map(item => {
        const isActive = active === item.id;
        const isDragging = draggedId === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onSelect(item.id)}
            title={item.label}
            aria-label={item.label}
            aria-current={isActive ? 'page' : undefined}
            draggable
            onDragStart={(e) => handleDragStart(e, item.id)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, item.id)}
            onDragEnd={() => setDraggedId(null)}
            className={`relative w-12 h-10 flex items-center justify-center transition-colors cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-30' : 'opacity-100'}`}
          >
            {isActive && (
              <span className="absolute left-0 inset-y-2 w-0.5 bg-blue-500 rounded-full" aria-hidden="true" />
            )}
            <span
              className="w-8 h-8 flex items-center justify-center rounded transition-colors"
              style={{
                color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                background: isActive ? 'rgba(59,130,246,0.1)' : 'transparent',
              }}
              onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLSpanElement).style.background = 'var(--surface-3)'; }}
              onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLSpanElement).style.background = 'transparent'; }}
            >
              {item.icon}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
