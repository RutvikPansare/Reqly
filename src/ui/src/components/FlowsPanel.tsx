import { useEffect, useState } from 'react';
import { GitBranch, Plus } from 'lucide-react';
import { fetchFlows, createFlow, deleteFlow } from '../api';

interface FlowsPanelProps {
  selectedFlow: string | null;
  onSelectFlow: (name: string) => void;
  lastResults: Record<string, any>;
}

export function FlowsPanel({ selectedFlow, onSelectFlow, lastResults }: FlowsPanelProps) {
  const [flows, setFlows] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; name: string } | null>(null);

  const loadData = () => {
    fetchFlows().then(setFlows).catch(console.error);
  };

  useEffect(() => {
    loadData();
    const closeMenu = () => setContextMenu(null);
    document.addEventListener('click', closeMenu);
    window.addEventListener('reqly-reload', loadData);
    return () => {
      document.removeEventListener('click', closeMenu);
      window.removeEventListener('reqly-reload', loadData);
    };
  }, []);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) { setCreating(false); return; }
    await createFlow(name);
    setNewName('');
    setCreating(false);
    loadData();
    onSelectFlow(name);
  };

  const handleDelete = async (name: string) => {
    await deleteFlow(name);
    setContextMenu(null);
    loadData();
  };

  const badgeFor = (name: string) => {
    const result = lastResults[name];
    if (!result) return null;
    const allSteps = result.dataRows ? result.dataRows.flatMap((r: any) => r.steps) : result.steps;
    const failed = allSteps.filter((s: any) => !s.passed).length;
    if (failed > 0) {
      return <span className="flow-badge badge-fail">{failed} fail</span>;
    }
    return <span className="flow-badge badge-pass">pass</span>;
  };

  return (
    <div className="flex flex-col h-full">
      <div
        className="flex items-center justify-between shrink-0"
        style={{ padding: '10px 12px 8px', borderBottom: '1px solid var(--border)' }}
      >
        <span
          className="text-[11px] font-medium uppercase"
          style={{ color: 'var(--text-secondary)', letterSpacing: '0.06em' }}
        >
          Flows
        </span>
        <button
          onClick={() => setCreating(true)}
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
          title="New flow"
        >
          <Plus size={14} />
        </button>
      </div>

      {creating && (
        <div className="px-3 py-1.5">
          <input
            autoFocus
            className="input w-full text-xs"
            placeholder="Flow name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') { setCreating(false); setNewName(''); }
            }}
            onBlur={handleCreate}
          />
        </div>
      )}

      {flows.length === 0 && !creating && (
        <div className="flex flex-col items-center justify-center py-8 gap-2" style={{ color: 'var(--text-muted)' }}>
          <GitBranch size={28} strokeWidth={1.2} opacity={0.35} />
          <p className="text-xs">No flows yet</p>
          <button onClick={() => setCreating(true)} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
            + Create one
          </button>
        </div>
      )}

      {flows.map(flow => {
        const isActive = selectedFlow === flow.name;
        return (
          <div
            key={flow.name}
            onClick={() => onSelectFlow(flow.name)}
            onContextMenu={e => { e.preventDefault(); setContextMenu({ x: e.pageX, y: e.pageY, name: flow.name }); }}
            className="flex items-center cursor-pointer"
            style={{
              padding: '7px 12px',
              gap: '8px',
              color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
              borderLeft: `2px solid ${isActive ? 'var(--fill-accent)' : 'transparent'}`,
              background: isActive ? 'var(--surface-0)' : 'transparent',
            }}
            onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--surface-0)'; }}
            onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
          >
            <GitBranch size={14} className="shrink-0" />
            <span className="text-xs truncate flex-1">{flow.name}</span>
            {badgeFor(flow.name)}
          </div>
        );
      })}

      {contextMenu && (
        <div
          className="fixed rounded py-1 z-50 text-sm min-w-[130px]"
          style={{ top: contextMenu.y, left: contextMenu.x, background: 'var(--surface-2)', border: '1px solid var(--border-strong)', boxShadow: '0 16px 48px rgba(0,0,0,0.5)' }}
          onClick={e => e.stopPropagation()}
        >
          <button
            className="w-full text-left px-4 py-1.5 transition-colors text-red-400 hover:text-red-300"
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            onClick={() => handleDelete(contextMenu.name)}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
