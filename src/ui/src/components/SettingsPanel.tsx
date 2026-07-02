import { useEffect, useState } from 'react';
import { ArrowUp, ArrowDown, Trash2, Plus } from 'lucide-react';
import { Modal, ModalFooter } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { updateDotenvFiles, updateLoginItem, fetchWorkspaceProjects, addWorkspaceProject, removeWorkspaceProject } from '../api';

interface SettingsPanelProps {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [files, setFiles] = useState<string[]>([]);
  const [newFile, setNewFile] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loginItemSupported, setLoginItemSupported] = useState(false);
  const [launchAtLogin, setLaunchAtLogin] = useState(false);
  const [missingGitignores, setMissingGitignores] = useState<string[]>([]);
  const [tab, setTab] = useState<'general' | 'workspace'>('general');
  const [workspaces, setWorkspaces] = useState<{name: string, path: string}[]>([]);
  const [newWorkspace, setNewWorkspace] = useState('');
  const [fixingGitignore, setFixingGitignore] = useState(false);

  useEffect(() => {
    import('../api').then(({ fetchDotenvFiles, fetchLoginItem, fetchGitignoreStatus }) => {
      fetchDotenvFiles().then(data => setFiles(data.files)).catch(console.error);
      fetchLoginItem().then(data => {
        setLoginItemSupported(data.supported);
        setLaunchAtLogin(data.enabled);
      }).catch(console.error);
      fetchGitignoreStatus().then(data => {
        setMissingGitignores(data.missing || []);
      }).catch(console.error);
      fetchWorkspaceProjects().then(data => setWorkspaces(data.projects)).catch(console.error);
    });
  }, []);

  const toggleLaunchAtLogin = async () => {
    const next = !launchAtLogin;
    setLaunchAtLogin(next);
    try {
      await updateLoginItem(next);
    } catch (e) {
      console.error(e);
      setLaunchAtLogin(!next);
      alert('Failed to update launch at login setting');
    }
  };

  const handleFixGitignore = async () => {
    setFixingGitignore(true);
    try {
      const { fixGitignore } = await import('../api');
      await fixGitignore();
      setMissingGitignores([]);
    } catch (e) {
      console.error(e);
      alert('Failed to update .gitignore');
    } finally {
      setFixingGitignore(false);
    }
  };

  const move = (i: number, dir: -1 | 1) => {
    const next = [...files];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setFiles(next);
  };

  const remove = (i: number) => setFiles(files.filter((_, idx) => idx !== i));

  const add = () => {
    const name = newFile.trim();
    if (!name || files.includes(name)) return;
    setFiles([...files, name]);
    setNewFile('');
  };


  const handleAddWorkspace = async () => {
    const trimmed = newWorkspace.trim();
    if (!trimmed) return;
    try {
      await addWorkspaceProject(trimmed);
      const data = await fetchWorkspaceProjects();
      setWorkspaces(data.projects);
      setNewWorkspace('');
      window.dispatchEvent(new Event('reqly-reload'));
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleRemoveWorkspace = async (p: string) => {
    try {
      await removeWorkspaceProject(p);
      const data = await fetchWorkspaceProjects();
      setWorkspaces(data.projects);
      window.dispatchEvent(new Event('reqly-reload'));
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await updateDotenvFiles(files);
      window.dispatchEvent(new Event('reqly-reload'));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error(e);
      alert('Failed to save environment files');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Settings" onClose={onClose}>

      <div className="flex gap-4 border-b mb-4" style={{ borderColor: 'var(--border)' }}>
        <button 
          className={`pb-2 text-sm ${tab === 'general' ? 'border-b-2 font-medium' : ''}`}
          style={{ borderColor: tab === 'general' ? 'var(--accent)' : 'transparent', color: tab === 'general' ? 'var(--text-primary)' : 'var(--text-secondary)' }}
          onClick={() => setTab('general')}
        >
          General
        </button>
        <button 
          className={`pb-2 text-sm ${tab === 'workspace' ? 'border-b-2 font-medium' : ''}`}
          style={{ borderColor: tab === 'workspace' ? 'var(--accent)' : 'transparent', color: tab === 'workspace' ? 'var(--text-primary)' : 'var(--text-secondary)' }}
          onClick={() => setTab('workspace')}
        >
          Workspace
        </button>
      </div>

      {tab === 'general' && (
        <>
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
          Environment files
        </label>
        <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
          .env-style files loaded as variables, lowest priority (below collection and environment vars). Later files in the list win on key collision.
        </p>

        <div className="flex flex-col gap-1.5 mb-2">
          {files.map((file, i) => (
            <div key={file} className="flex items-center gap-2">
              <span className="flex-1 text-sm font-mono" style={{ color: 'var(--text-primary)' }}>{file}</span>
              <button onClick={() => move(i, -1)} disabled={i === 0} style={{ color: 'var(--text-muted)', opacity: i === 0 ? 0.3 : 1 }} title="Move up">
                <ArrowUp size={13} />
              </button>
              <button onClick={() => move(i, 1)} disabled={i === files.length - 1} style={{ color: 'var(--text-muted)', opacity: i === files.length - 1 ? 0.3 : 1 }} title="Move down">
                <ArrowDown size={13} />
              </button>
              <button onClick={() => remove(i)} style={{ color: 'var(--text-muted)' }} title="Remove">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          {files.length === 0 && (
            <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>No environment files configured.</p>
          )}
        </div>

        <div className="flex gap-2">
          <Input
            value={newFile}
            onChange={e => setNewFile(e.target.value)}
            placeholder=".env.local"
            onKeyDown={e => e.key === 'Enter' && add()}
          />
          <Button variant="secondary" onClick={add}><Plus size={13} /> Add</Button>
        </div>
      </div>

      {loginItemSupported && (
        <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-primary)' }}>
            <input type="checkbox" checked={launchAtLogin} onChange={toggleLaunchAtLogin} />
            Launch at login
          </label>
        </div>
      )}

      <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
          Gitignore status
        </label>
        {missingGitignores.length === 0 ? (
          <p className="text-xs flex items-center gap-1.5" style={{ color: 'var(--success)' }}>
            <span className="flex items-center justify-center w-4 h-4 rounded-full bg-green-500/20 text-green-500">✓</span>
            All runtime state files are gitignored.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-xs" style={{ color: 'var(--warning)' }}>
              Missing entries in .gitignore: {missingGitignores.join(', ')}
            </p>
            <Button variant="secondary" onClick={handleFixGitignore} disabled={fixingGitignore}>
              {fixingGitignore ? 'Fixing...' : 'Add to .gitignore'}
            </Button>
          </div>
        )}
      </div>

        </>
      )}

      {tab === 'workspace' && (
        <div className="flex flex-col gap-3 min-h-[250px]">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Configure additional project directories to include in your workspace. Reqly will load collections from these directories as well.
          </p>
          
          <div className="flex flex-col gap-2 flex-1">
            {workspaces.map((ws, i) => (
              <div key={ws.path} className="flex items-center justify-between p-2 rounded" style={{ background: 'var(--surface-3)' }}>
                <div className="flex flex-col min-w-0 flex-1 mr-2">
                  <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{ws.name}</span>
                  <span className="text-xs font-mono truncate" style={{ color: 'var(--text-muted)' }}>{ws.path}</span>
                </div>
                {i > 0 && (
                  <button onClick={() => handleRemoveWorkspace(ws.path)} style={{ color: 'var(--text-muted)' }} title="Remove from workspace">
                    <Trash2 size={14} />
                  </button>
                )}
                {i === 0 && (
                  <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded" style={{ background: 'var(--accent)', color: '#fff' }}>Active</span>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-2 mt-auto pt-2">
            <Input
              value={newWorkspace}
              onChange={e => setNewWorkspace(e.target.value)}
              placeholder="/Users/name/projects/api"
              onKeyDown={e => e.key === 'Enter' && handleAddWorkspace()}
            />
            <Button variant="secondary" onClick={handleAddWorkspace}><Plus size={13} /> Add</Button>
          </div>
        </div>
      )}

      <ModalFooter>
        {saved && <span className="text-xs self-center mr-2" style={{ color: 'var(--accent)' }}>Saved</span>}
        <Button variant="ghost" onClick={onClose}>Close</Button>
        <Button variant="primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
      </ModalFooter>
    </Modal>
  );
}
