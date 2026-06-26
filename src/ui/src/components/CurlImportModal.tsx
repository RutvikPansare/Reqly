import { useState } from 'react';
import { Terminal } from 'lucide-react';
import { Modal, ModalFooter } from './ui/Modal';
import { importFromCurl } from '../api';

interface CurlImportModalProps {
  onImport: (parsed: { url: string; method: string; headers: Record<string, string>; body?: string }) => void;
  onClose: () => void;
}

export function CurlImportModal({ onImport, onClose }: CurlImportModalProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleImport = async () => {
    if (!value.trim()) return;
    setError('');
    setLoading(true);
    try {
      const parsed = await importFromCurl(value.trim());
      onImport(parsed);
      onClose();
    } catch (e: any) {
      setError(e.message || 'Failed to parse cURL command');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="Import from cURL" onClose={onClose} icon={<Terminal size={16} style={{ color: 'var(--accent)' }} />}>
      <div className="flex flex-col gap-3">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Paste a cURL command to populate the request editor.
        </p>
        <textarea
          autoFocus
          className="input font-mono text-sm resize-none"
          style={{ minHeight: '140px', lineHeight: '1.5' }}
          placeholder={`curl -X POST 'https://api.example.com/users' \\\n  -H 'Content-Type: application/json' \\\n  -d '{"name":"John"}'`}
          value={value}
          onChange={e => { setValue(e.target.value); setError(''); }}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleImport(); }}
          spellCheck={false}
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
      <ModalFooter>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button
          className="btn btn-primary"
          onClick={handleImport}
          disabled={!value.trim() || loading}
        >
          {loading ? 'Parsing...' : 'Import'}
        </button>
      </ModalFooter>
    </Modal>
  );
}
