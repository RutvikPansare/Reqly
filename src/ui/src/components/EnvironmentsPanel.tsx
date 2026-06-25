import { useEffect, useState } from 'react';
import { ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { fetchEnvironments, createEnvironment, updateEnvironment, deleteEnvironment, setActiveEnvironment } from '../api';

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
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Environments</h2>
        <button
          onClick={() => setCreating(true)}
          className="text-xs text-blue-400 hover:text-blue-300 px-2 py-0.5 rounded hover:bg-gray-800 transition-colors"
          title="New environment"
        >
          + New
        </button>
      </div>

      <div className="overflow-y-auto flex-1">
        {creating && (
          <div className="mb-3 flex gap-2">
            <input
              autoFocus
              className="flex-1 bg-gray-950 border border-gray-700 rounded px-2 py-1 text-sm text-white outline-none focus:border-blue-500"
              placeholder="Environment name (e.g. Production)"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreate();
                if (e.key === 'Escape') { setCreating(false); setNewName(''); }
              }}
              onBlur={() => { if (!newName.trim()) setCreating(false); }}
            />
            <button
              onClick={handleCreate}
              disabled={!newName.trim()}
              className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded transition-colors"
            >
              Add
            </button>
          </div>
        )}

        {environments.length === 0 && !creating && (
          <p className="text-xs text-gray-600 italic px-1">No environments yet. Click + New.</p>
        )}

        <ul className="space-y-1">
          {environments.map(env => {
            const isActive = active === env.name;
            const isOpen = expanded[env.name];
            const rows = drafts[env.name] || toVars(env);
            return (
              <li key={env.name} className="rounded">
                <div
                  className={`p-1.5 rounded group flex items-center justify-between ${isActive ? 'bg-gray-800' : 'hover:bg-gray-800/50'}`}
                >
                  <div className="flex items-center flex-1 overflow-hidden">
                    <button
                      onClick={() => toggleExpand(env.name)}
                      className={`text-gray-500 mr-1 flex items-center transition-transform ${isOpen ? 'rotate-90' : ''}`}
                      title={isOpen ? 'Collapse' : 'Expand'}
                    >
                      <ChevronRight size={14} />
                    </button>
                    <span
                      className="cursor-pointer flex-1 flex items-center"
                      onClick={() => handleSelect(env.name)}
                      title={isActive ? 'Active' : 'Set active'}
                    >
                      <span className={`inline-block w-2 h-2 rounded-full mr-2 shrink-0 ${isActive ? 'bg-green-500' : 'bg-gray-600'}`}></span>
                      <span className={`truncate ${isActive ? 'text-white' : 'text-gray-300'}`}>{env.name}</span>
                    </span>
                  </div>
                  <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => toggleExpand(env.name)}
                      className="px-1 text-gray-500 hover:text-blue-400"
                      title="Edit variables"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => setConfirmDelete(env.name)}
                      className="px-1 text-gray-500 hover:text-red-400"
                      title="Delete environment"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="mt-1 ml-4 pl-2 border-l border-gray-800">
                    <div className="flex items-center gap-2 py-1">
                      <span className="text-[10px] font-bold text-gray-600 w-1/2">KEY</span>
                      <span className="text-[10px] font-bold text-gray-600 w-1/2">VALUE</span>
                      <span className="w-5"></span>
                    </div>
                    {rows.map((v, i) => (
                      <div key={i} className="flex items-center gap-2 group">
                        <input
                          className="w-1/2 bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 font-mono focus:outline-none focus:border-blue-500"
                          placeholder="key"
                          value={v.key}
                          onChange={e => updateDraft(env.name, i, 'key', e.target.value)}
                        />
                        <input
                          className="w-1/2 bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 font-mono focus:outline-none focus:border-blue-500"
                          placeholder="value"
                          value={v.value}
                          onChange={e => updateDraft(env.name, i, 'value', e.target.value)}
                        />
                        <button
                          onClick={() => removeRow(env.name, i)}
                          className="w-5 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Remove row"
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                    <div className="flex items-center justify-between mt-2">
                      <button
                        onClick={() => addRow(env.name)}
                        className="text-xs text-blue-400 hover:text-blue-300"
                      >
                        + Add row
                      </button>
                      <button
                        onClick={() => handleSave(env.name)}
                        disabled={saving === env.name}
                        className={`w-20 py-1 text-xs disabled:opacity-50 text-white rounded transition-colors text-center flex justify-center items-center ${saved === env.name ? 'bg-green-600 hover:bg-green-500' : 'bg-blue-600 hover:bg-blue-500'}`}
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
          <div className="bg-gray-900 border border-gray-700 rounded p-5 w-[360px]">
            <h3 className="text-sm font-semibold text-white mb-2">Delete environment?</h3>
            <p className="text-xs text-gray-400 mb-4">
              This permanently removes <span className="text-gray-200 font-medium">{confirmDelete}</span> and its variables.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-3 py-1.5 text-xs font-medium text-gray-300 bg-gray-800 border border-gray-700 rounded hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-500 rounded transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
