import { useEffect, useState } from 'react';
import { ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { fetchEnvironments, createEnvironment, updateEnvironment, deleteEnvironment, setActiveEnvironment } from '../api';
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
                  <div className="mt-1 ml-4 pl-2" style={{ borderLeft: '1px solid var(--border)' }}>
                    <div className="flex items-center gap-2 py-1">
                      <span className="text-[10px] font-bold w-1/2" style={{ color: 'var(--text-muted)' }}>KEY</span>
                      <span className="text-[10px] font-bold w-1/2" style={{ color: 'var(--text-muted)' }}>VALUE</span>
                      <span className="w-5"></span>
                    </div>
                    {rows.map((v, i) => (
                      <div key={i} className="flex items-center gap-2 group mb-1.5">
                        <input
                          className="input w-1/2 text-xs font-mono py-1"
                          placeholder="key"
                          value={v.key}
                          onChange={e => updateDraft(env.name, i, 'key', e.target.value)}
                        />
                        <input
                          className="input w-1/2 text-xs font-mono py-1"
                          placeholder="value"
                          value={v.value}
                          onChange={e => updateDraft(env.name, i, 'value', e.target.value)}
                        />
                        <button
                          onClick={() => removeRow(env.name, i)}
                          className="w-5 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-sm"
                          style={{ color: 'var(--text-muted)' }}
                          title="Remove row"
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                    <div className="flex items-center justify-between mt-2 pb-2">
                      <button
                        onClick={() => addRow(env.name)}
                        className="text-xs text-blue-400 hover:text-blue-300"
                      >
                        + Add row
                      </button>
                      <button
                        onClick={() => handleSave(env.name)}
                        disabled={saving === env.name}
                        className={`px-3 py-1 text-xs disabled:opacity-50 text-white rounded transition-colors ${saved === env.name ? 'bg-green-600 hover:bg-green-500' : 'bg-blue-600 hover:bg-blue-500'}`}
                      >
                        {saving === env.name ? 'Saving...' : saved === env.name ? 'Saved!' : 'Save'}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

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
