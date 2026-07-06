import { useEffect, useRef, useState } from 'react';
import { Boxes, Check, ChevronDown, Plus, Settings2, Trash2, X } from 'lucide-react';
import type { NamedWorkspace } from '../api.js';
import {
  createNamedWorkspace,
  fetchWorkspaces,
  linkWorkspaceRepo,
  setActiveWorkspace,
  unlinkWorkspaceRepo,
} from '../api.js';

/**
 * T-226: workspace dropdown shown above the project list. Named workspaces
 * group repos under stable aliases for cross-repo flows. "No workspace"
 * means single-project behaviour, exactly as before.
 */
export function WorkspaceSwitcher() {
  const [workspaces, setWorkspaces] = useState<NamedWorkspace[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [settingsFor, setSettingsFor] = useState<NamedWorkspace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const reload = () =>
    fetchWorkspaces()
      .then(({ workspaces, active }) => {
        setWorkspaces(workspaces);
        setActive(active);
      })
      .catch(() => {});

  useEffect(() => {
    reload();
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const activate = async (name: string | null) => {
    try {
      await setActiveWorkspace(name);
      setActive(name);
      setOpen(false);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await createNamedWorkspace(name);
      setNewName('');
      setCreating(false);
      await reload();
      await activate(name);
      setSettingsFor((await fetchWorkspaces()).workspaces.find(w => w.name === name) ?? null);
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors"
        style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
        title={active ? `Workspace: ${active}` : 'No workspace active'}
      >
        <Boxes size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <span className="flex-1 text-left truncate">{active ?? 'No workspace'}</span>
        <ChevronDown size={12} style={{ color: 'var(--text-muted)' }} />
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 mt-1 rounded z-50 py-1"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
        >
          <button
            onClick={() => activate(null)}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-white/5 transition-colors"
            style={{ color: 'var(--text-secondary)' }}
          >
            <span className="w-3.5">{active === null && <Check size={12} />}</span>
            No workspace
          </button>

          {workspaces.map(ws => (
            <div key={ws.name} className="flex items-center group">
              <button
                onClick={() => activate(ws.name)}
                className="flex-1 flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-white/5 transition-colors min-w-0"
                style={{ color: 'var(--text-secondary)' }}
              >
                <span className="w-3.5 shrink-0">{active === ws.name && <Check size={12} />}</span>
                <span className="truncate">{ws.name}</span>
                <span className="ml-auto shrink-0" style={{ color: 'var(--text-muted)' }}>
                  {ws.repos.length} repo{ws.repos.length === 1 ? '' : 's'}
                </span>
              </button>
              <button
                onClick={() => { setSettingsFor(ws); setOpen(false); }}
                className="px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: 'var(--text-muted)' }}
                title={`${ws.name} settings`}
              >
                <Settings2 size={12} />
              </button>
            </div>
          ))}

          <div style={{ borderTop: '1px solid var(--border)' }} className="mt-1 pt-1">
            {creating ? (
              <div className="px-2 py-1">
                <input
                  autoFocus
                  className="w-full bg-transparent outline-none text-xs px-1 py-0.5 rounded"
                  style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                  placeholder="workspace-name"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleCreate();
                    if (e.key === 'Escape') { setCreating(false); setNewName(''); }
                  }}
                />
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-white/5 transition-colors"
                style={{ color: 'var(--accent)' }}
              >
                <Plus size={12} />
                New workspace
              </button>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="mt-1 text-xs px-2 py-1 rounded flex items-center gap-2" style={{ color: '#f87171', border: '1px solid var(--border)' }}>
          <span className="flex-1 truncate" title={error}>{error}</span>
          <button onClick={() => setError(null)}><X size={11} /></button>
        </div>
      )}

      {settingsFor && (
        <WorkspaceSettingsModal
          workspace={settingsFor}
          onClose={() => { setSettingsFor(null); reload(); }}
        />
      )}
    </div>
  );
}

function WorkspaceSettingsModal({ workspace, onClose }: { workspace: NamedWorkspace; onClose: () => void }) {
  const [ws, setWs] = useState(workspace);
  const [alias, setAlias] = useState('');
  const [repoPath, setRepoPath] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleLink = async () => {
    if (!alias.trim() || !repoPath.trim()) return;
    try {
      const updated = await linkWorkspaceRepo(ws.name, alias.trim(), repoPath.trim());
      setWs(updated);
      setAlias('');
      setRepoPath('');
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleUnlink = async (a: string) => {
    try {
      setWs(await unlinkWorkspaceRepo(ws.name, a));
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div
        className="w-[440px] max-w-[90vw] rounded p-4"
        style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Workspace: {ws.name}
          </h3>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={14} /></button>
        </div>

        <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>
          Linked repos
        </div>
        {ws.repos.length === 0 && (
          <div className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
            No repos linked yet. Aliases are stable across teammates; paths are local to this machine.
          </div>
        )}
        <div className="space-y-1 mb-3">
          {ws.repos.map(r => (
            <div key={r.alias} className="flex items-center gap-2 px-2 py-1 rounded text-xs" style={{ border: '1px solid var(--border)' }}>
              <span className="font-mono font-semibold shrink-0" style={{ color: 'var(--accent)' }}>{r.alias}</span>
              <span className="flex-1 truncate font-mono" style={{ color: 'var(--text-muted)' }} title={r.path}>{r.path}</span>
              <button onClick={() => handleUnlink(r.alias)} title={`Unlink ${r.alias}`} style={{ color: 'var(--text-muted)' }}>
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 mb-3">
          <input
            className="w-24 bg-transparent outline-none text-xs px-2 py-1 rounded font-mono"
            style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
            placeholder="alias"
            value={alias}
            onChange={e => setAlias(e.target.value)}
          />
          <input
            className="flex-1 bg-transparent outline-none text-xs px-2 py-1 rounded font-mono"
            style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
            placeholder="/path/to/repo"
            value={repoPath}
            onChange={e => setRepoPath(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleLink(); }}
          />
          <button
            onClick={handleLink}
            className="text-xs px-2 py-1 rounded transition-colors"
            style={{ border: '1px solid var(--border)', color: 'var(--accent)' }}
          >
            Link
          </button>
        </div>

        {ws.sharedEnv && Object.keys(ws.sharedEnv).length > 0 && (
          <>
            <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>
              Shared env
            </div>
            <div className="space-y-1 mb-2">
              {Object.entries(ws.sharedEnv).map(([k, v]) => (
                <div key={k} className="flex items-center gap-2 px-2 py-1 rounded text-xs font-mono" style={{ border: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{k}</span>
                  <span className="flex-1 truncate" style={{ color: 'var(--text-muted)' }}>{v}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {error && <div className="text-xs" style={{ color: '#f87171' }}>{error}</div>}
      </div>
    </div>
  );
}
