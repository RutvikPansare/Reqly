import { useEffect, useState } from 'react';
import { ArrowUp, ArrowDown, Trash2, Plus } from 'lucide-react';
import { Modal, ModalFooter } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { fetchDotenvFiles, updateDotenvFiles, fetchLoginItem, updateLoginItem } from '../api';

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

  useEffect(() => {
    fetchDotenvFiles().then(data => setFiles(data.files)).catch(console.error);
    fetchLoginItem().then(data => {
      setLoginItemSupported(data.supported);
      setLaunchAtLogin(data.enabled);
    }).catch(console.error);
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

      <ModalFooter>
        {saved && <span className="text-xs self-center mr-2" style={{ color: 'var(--accent)' }}>Saved</span>}
        <Button variant="ghost" onClick={onClose}>Close</Button>
        <Button variant="primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
      </ModalFooter>
    </Modal>
  );
}
