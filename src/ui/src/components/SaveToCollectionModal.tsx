import { useEffect, useState } from 'react';
import { fetchCollections, createCollection, addRequest } from '../api';
import { Modal, ModalFooter } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';

interface SaveToCollectionModalProps {
  request: any;
  defaultName: string;
  onClose: () => void;
  onSaved: (collectionName: string, requestName: string, requestId?: string) => void;
}

const NEW_COLLECTION = '__new__';

export function SaveToCollectionModal({ request, defaultName, onClose, onSaved }: SaveToCollectionModalProps) {
  const [collections, setCollections] = useState<string[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string>('');
  const [newCollectionName, setNewCollectionName] = useState('');
  const [requestName, setRequestName] = useState(defaultName === 'New Request' ? '' : defaultName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCollections().then((cols: any[]) => {
      const names = cols.map((c) => c.name);
      setCollections(names);
      setSelectedCollection(names[0] || NEW_COLLECTION);
    });
  }, []);

  const handleSave = async () => {
    const name = requestName.trim() || 'New Request';
    setError(null);
    setSaving(true);
    try {
      let collectionName = selectedCollection;
      if (selectedCollection === NEW_COLLECTION) {
        collectionName = newCollectionName.trim();
        if (!collectionName) {
          setError('Collection name is required');
          setSaving(false);
          return;
        }
        if (collections.some(c => c.toLowerCase() === collectionName.toLowerCase())) {
          setError(`Collection '${collectionName}' already exists. Please choose a different name.`);
          setSaving(false);
          return;
        }
        await createCollection(collectionName);
      }
      const requestToSave = { ...request, name };
      if (!requestToSave.id) {
        requestToSave.id = Date.now().toString();
      }
      await addRequest(collectionName, requestToSave);
      window.dispatchEvent(new Event('reqly-reload'));
      window.dispatchEvent(new CustomEvent('reqly-request-saved', { detail: { col: collectionName } }));
      onSaved(collectionName, name, requestToSave.id);
    } catch (e: any) {
      setError(e.message || 'Failed to save request');
      setSaving(false);
    }
  };

  return (
    <Modal title="Save request" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Request name</label>
          <Input
            autoFocus
            value={requestName}
            onChange={(e) => setRequestName(e.target.value)}
            placeholder="New Request"
            onKeyDown={e => e.key === 'Enter' && !saving && handleSave()}
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Collection</label>
          <select
            value={selectedCollection}
            onChange={(e) => setSelectedCollection(e.target.value)}
            className="input w-full"
          >
            {collections.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
            <option value={NEW_COLLECTION}>+ New collection</option>
          </select>
        </div>
        {selectedCollection === NEW_COLLECTION && (
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>New collection name</label>
            <Input
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              placeholder="My API"
            />
          </div>
        )}
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
      <ModalFooter>
        <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
      </ModalFooter>
    </Modal>
  );
}
