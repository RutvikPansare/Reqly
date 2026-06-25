import { useEffect, useState } from 'react';
import { fetchCollections, createCollection, addRequest } from '../api';

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
        await createCollection(collectionName);
      }
      const requestToSave = { ...request, name };
      if (!requestToSave.id) {
        requestToSave.id = Date.now().toString();
      }
      await addRequest(collectionName, requestToSave);
      window.dispatchEvent(new Event('reqly-reload'));
      onSaved(collectionName, name, requestToSave.id);
    } catch (e: any) {
      setError(e.message || 'Failed to save request');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-800 rounded-lg w-[400px] overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800 flex justify-between items-center bg-gray-950">
          <h2 className="font-semibold text-gray-200">Save request</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">&times;</button>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Request name</label>
            <input
              autoFocus
              value={requestName}
              onChange={(e) => setRequestName(e.target.value)}
              placeholder="New Request"
              className="w-full bg-gray-950 border border-gray-800 rounded px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Collection</label>
            <select
              value={selectedCollection}
              onChange={(e) => setSelectedCollection(e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 rounded px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
            >
              {collections.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
              <option value={NEW_COLLECTION}>+ New collection</option>
            </select>
          </div>
          {selectedCollection === NEW_COLLECTION && (
            <div>
              <label className="text-xs text-gray-500 block mb-1">New collection name</label>
              <input
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                placeholder="My API"
                className="w-full bg-gray-950 border border-gray-800 rounded px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
              />
            </div>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <div className="px-4 py-3 border-t border-gray-800 flex justify-end gap-2 bg-gray-950">
          <button
            className="px-4 py-1.5 text-sm font-semibold text-gray-400 hover:text-white"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            className="px-4 py-1.5 text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded disabled:opacity-50"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
