import { useEffect, useState } from 'react';
import { ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { fetchEnvironments, createEnvironment, updateEnvironment, deleteEnvironment, duplicateEnvironment, setActiveEnvironment } from '../api';
import { Modal, ModalFooter } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';

interface EnvVar { key: string; value: string }

export function EnvironmentsPanel() {
  const [environments, setEnvironments] = useState<any[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // New environment inline form
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  // Per-environment variable drafts (local edits before Save)
  const [drafts, setDrafts] = useState<Record<string, EnvVar[]>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Right-click context menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; name: string } | null>(null);

  const loadData = () => {
    fetchEnvironments().then(data => {
      setEnvironments(data.environments || []);
      setActive(data.active || null);
    }).catch(console.error);
  };

  useEffect(() => {
    loadData();
    window.addEventListener('reqly-reload', loadData);
    return () => window.removeEventListener('reqly-reload', loadData);
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [contextMenu]);

  const toVars = (env: any): EnvVar[] => {
    const vars: EnvVar[] = [];
    if (env?.variables) {
      Object.entries(env.variables).forEach(([k, v]) => {
        vars.push({ key: k, value: String(v) });
      });
    }
    return vars;
  };

  const handleSelect = async (name: string) => {
    await setActiveEnvironment(name);
    loadData();
    window.dispatchEvent(new Event('reqly-reload'));
  };

  const toggleExpand = (name: string) => {
    setExpanded(prev => {
      const willOpen = !prev[name];
      // Seed the draft from the live environment when opening.
      if (willOpen) {
        const env = environments.find(e => e.name === name);
        setDrafts(d => ({ ...d, [name]: toVars(env) }));
      }
      return { ...prev, [name]: willOpen };
    });
  };

  const handleCreate = async () => {
    if (newName.trim()) {
      await createEnvironment(newName.trim());
      setNewName('');
      setCreating(false);
      loadData();
    }
  };

  const updateDraft = (name: string, index: number, field: keyof EnvVar, val: string) => {
    setDrafts(prev => {
      const rows = [...(prev[name] || [])];
      rows[index] = { ...rows[index], [field]: val };
      return { ...prev, [name]: rows };
    });
  };

  const addRow = (name: string) => {
    setDrafts(prev => ({ ...prev, [name]: [...(prev[name] || []), { key: '', value: '' }] }));
  };

  const removeRow = (name: string, index: number) => {
    setDrafts(prev => ({
      ...prev,
      [name]: (prev[name] || []).filter((_, i) => i !== index)
    }));
  };

  const handleSave = async (name: string) => {
    const rows = drafts[name] || [];
    const varsObj: Record<string, string> = {};
    rows.forEach(v => { if (v.key.trim()) varsObj[v.key.trim()] = v.value; });

    setSaving(name);
    setSaved(null);
    try {
      await updateEnvironment(name, varsObj);
      loadData();
      setSaved(name);
      setTimeout(() => {
        setSaved(prev => (prev === name ? null : prev));
      }, 2000);
    } catch (e) {
      console.error(e);
      alert('Failed to save environment');
    } finally {
      setSaving(null);
    }
  };

  const handleDuplicate = async (name: string) => {
    try {
      await duplicateEnvironment(name);
      loadData();
    } catch (e) {
      console.error(e);
      alert('Failed to duplicate environment');
    }
  };

  const handleDelete = async (name: string) => {
    try {
      await deleteEnvironment(name);
      setConfirmDelete(null);
      setExpanded(prev => { const n = { ...prev }; delete n[name]; return n; });
      loadData();
      window.dispatchEvent(new Event('reqly-reload'));
    } catch (e) {
      console.error(e);
      alert('Failed to delete environment');
    }
  };

  return (
    <div className="p-3 flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between shrink-0">
        <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Environments</h2>
        <button
          onClick={() => setCreating(true)}
          className="text-xs text-blue-400 hover:text-blue-300 px-2 py-0.5 rounded transition-colors"
          title="New environment"
        >
          + New
        </button>
      </div>

      <div className="overflow-y-auto flex-1">
        {creating && (
          <div className="mb-3 flex gap-2">
            <Input
              autoFocus
              placeholder="Environment name (e.g. Production)"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreate();
                if (e.key === 'Escape') { setCreating(false); setNewName(''); }
              }}
              onBlur={() => { if (!newName.trim()) setCreating(false); }}
            />
            <Button variant="primary" size="sm" onClick={handleCreate} disabled={!newName.trim()}>Add</Button>
          </div>
        )}

        {environments.length === 0 && !creating && (
          <p className="text-xs italic px-1" style={{ color: 'var(--text-muted)' }}>No environments yet. Click + New.</p>
        )}

        <ul className="space-y-1">
          {environments.map(env => {
            const isActive = active === env.name;
            const isOpen = expanded[env.name];
            const rows = drafts[env.name] || toVars(env);
            return (
              <li key={env.name} className="rounded overflow-hidden">
                <div
                  className="p-1.5 rounded group flex items-center justify-between transition-colors"
                  style={{ background: isActive ? 'var(--surface-3)' : 'transparent' }}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-3)'; }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                  onContextMenu={e => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, name: env.name }); }}
                >
                  <div className="flex items-center flex-1 overflow-hidden">
                    <button
                      onClick={() => toggleExpand(env.name)}
                      className="mr-1 flex items-center transition-transform"
                      style={{ color: 'var(--text-muted)', transform: isOpen ? 'rotate(90deg)' : 'none' }}
                      title={isOpen ? 'Collapse' : 'Expand'}
                    >
                      <ChevronRight size={14} />
                    </button>
                    <span
                      className="cursor-pointer flex-1 flex items-center"
                      onClick={() => handleSelect(env.name)}
                      title={isActive ? 'Active' : 'Set active'}
                    >
                      <span className={`inline-block w-2 h-2 rounded-full mr-2 shrink-0 ${isActive ? 'bg-green-400' : 'bg-gray-600'}`}></span>
                      <span className="truncate text-sm" style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{env.name}</span>
                    </span>
                  </div>
                  <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => toggleExpand(env.name)}
                      className="px-1 hover:text-blue-400 transition-colors"
                      style={{ color: 'var(--text-muted)' }}
                      title="Edit variables"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => setConfirmDelete(env.name)}
                      className="px-1 hover:text-red-400 transition-colors"
                      style={{ color: 'var(--text-muted)' }}
                      title="Delete environment"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="mt-2 rounded overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                    {/* Column headers */}
                    <div className="grid grid-cols-[1fr_1fr_28px] text-[10px] font-semibold uppercase tracking-widest px-3 py-1.5" style={{ background: 'var(--surface-3)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                      <span>Key</span>
                      <span>Value</span>
                      <span />
                    </div>

                    {rows.length === 0 && (
                      <div className="px-3 py-3 text-xs italic" style={{ color: 'var(--text-muted)' }}>No variables yet.</div>
                    )}

                    {rows.map((v, i) => (
                      <div
                        key={i}
                        className="grid grid-cols-[1fr_1fr_28px] group items-center"
                        style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : undefined }}
                      >
                        <input
                          className="bg-transparent px-3 py-1.5 text-xs font-mono outline-none w-full"
                          style={{ color: '#a78bfa', borderRight: '1px solid var(--border)' }}
                          placeholder="key"
                          value={v.key}
                          onChange={e => updateDraft(env.name, i, 'key', e.target.value)}
                          spellCheck={false}
                        />
                        <input
                          className="bg-transparent px-3 py-1.5 text-xs font-mono outline-none w-full"
                          style={{ color: 'var(--text-secondary)', borderRight: '1px solid var(--border)' }}
                          placeholder="value"
                          value={v.value}
                          onChange={e => updateDraft(env.name, i, 'value', e.target.value)}
                          spellCheck={false}
                        />
                        <button
                          onClick={() => removeRow(env.name, i)}
                          className="flex items-center justify-center h-full opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-400"
                          style={{ color: 'var(--text-muted)' }}
                          title="Remove"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}

                    {/* Footer: add row + save */}
                    <div className="flex items-center justify-between px-2 py-1.5" style={{ borderTop: rows.length > 0 ? '1px solid var(--border)' : undefined, background: 'var(--surface-3)' }}>
                      <button
                        onClick={() => addRow(env.name)}
                        className="text-xs transition-colors hover:text-blue-300 flex items-center gap-1"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> Add variable
                      </button>
                      <button
                        onClick={() => handleSave(env.name)}
                        disabled={saving === env.name}
                        className={`px-2.5 py-1 text-xs font-medium rounded disabled:opacity-50 transition-colors ${saved === env.name ? 'bg-green-600/20 text-green-400' : 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30'}`}
                      >
                        {saving === env.name ? 'Saving…' : saved === env.name ? 'Saved' : 'Save'}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          className="fixed rounded py-1 z-50 text-sm min-w-[130px]"
          style={{ top: contextMenu.y, left: contextMenu.x, background: 'var(--surface-2)', border: '1px solid var(--border-strong)', boxShadow: '0 16px 48px rgba(0,0,0,0.5)' }}
          onClick={e => e.stopPropagation()}
        >
          <button
            className="w-full text-left px-4 py-1.5 transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            onClick={() => { handleDuplicate(contextMenu.name); setContextMenu(null); }}
          >
            Duplicate
          </button>
          <button
            className="w-full text-left px-4 py-1.5 text-red-400 hover:text-red-300 transition-colors"
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            onClick={() => { setConfirmDelete(contextMenu.name); setContextMenu(null); }}
          >
            Delete
          </button>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {confirmDelete && (
        <Modal title="Delete environment?" onClose={() => setConfirmDelete(null)} width="w-[360px]">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            This permanently removes <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{confirmDelete}</span> and its variables.
          </p>
          <ModalFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => handleDelete(confirmDelete)}>Delete</Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
