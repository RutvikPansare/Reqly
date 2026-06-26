import { useEffect, useState } from 'react';
import { Settings } from 'lucide-react';
import { Modal, ModalFooter } from './ui/Modal';
import { Button } from './ui/Button';
import { KeyValueEditor } from './KeyValueEditor';
import type { KeyValuePair } from './KeyValueEditor';
import { getCollectionVariables, setCollectionVariable, deleteCollectionVariable } from '../api';

interface CollectionSettingsModalProps {
  collectionName: string;
  onClose: () => void;
}

export function CollectionSettingsModal({ collectionName, onClose }: CollectionSettingsModalProps) {
  const [activeTab] = useState<'variables'>('variables');
  const [pairs, setPairs] = useState<KeyValuePair[]>([]);
  const [originalKeys, setOriginalKeys] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getCollectionVariables(collectionName).then((vars) => {
      const entries = Object.entries(vars);
      setPairs(entries.map(([key, value]) => ({ key, value, enabled: true })));
      setOriginalKeys(entries.map(([key]) => key));
      setLoaded(true);
    }).catch(console.error);
  }, [collectionName]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const newKeys = new Set(pairs.filter(p => p.key.trim() && p.enabled).map(p => p.key.trim()));

      for (const key of originalKeys) {
        if (!newKeys.has(key)) {
          await deleteCollectionVariable(collectionName, key);
        }
      }
      for (const pair of pairs) {
        if (pair.key.trim() && pair.enabled) {
          await setCollectionVariable(collectionName, pair.key.trim(), pair.value);
        }
      }

      setOriginalKeys([...newKeys]);
      window.dispatchEvent(new Event('reqly-reload'));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error(e);
      alert('Failed to save collection variables');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`${collectionName} - Settings`} onClose={onClose} icon={<Settings size={16} />} width="w-[560px]">
      <div className="flex border-b mb-4" style={{ borderColor: 'var(--border)' }}>
        <button
          className="px-3 py-2 text-sm font-medium border-b-2"
          style={{
            color: activeTab === 'variables' ? 'var(--text-primary)' : 'var(--text-muted)',
            borderColor: activeTab === 'variables' ? 'var(--accent)' : 'transparent',
          }}
        >
          Variables
        </button>
      </div>

      <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
        Collection Variables - always available to requests in this collection, regardless of active environment. They take priority over environment variables with the same name.
      </p>

      {loaded && <KeyValueEditor pairs={pairs} onChange={setPairs} />}

      <ModalFooter>
        {saved && <span className="text-xs self-center mr-2" style={{ color: 'var(--accent)' }}>Saved</span>}
        <Button variant="ghost" onClick={onClose}>Close</Button>
        <Button variant="primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
      </ModalFooter>
    </Modal>
  );
}
