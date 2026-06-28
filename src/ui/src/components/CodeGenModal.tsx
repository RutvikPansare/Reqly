import { useEffect, useState } from 'react';
import { Code2, Copy, Check } from 'lucide-react';
import { Modal } from './ui/Modal';
import { generateCodeSnippet } from '../api';

interface CodeGenModalProps {
  request: any;
  onClose: () => void;
}

type Target = 'curl' | 'fetch' | 'axios';

const TABS: { id: Target; label: string }[] = [
  { id: 'curl',  label: 'cURL' },
  { id: 'fetch', label: 'fetch' },
  { id: 'axios', label: 'axios' },
];

export function CodeGenModal({ request, onClose }: CodeGenModalProps) {
  const [activeTab, setActiveTab] = useState<Target>('curl');
  const [codes, setCodes] = useState<Record<Target, string>>({ curl: '', fetch: '', axios: '' });
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all(
      TABS.map(t => generateCodeSnippet(request, t.id).then(code => ({ id: t.id, code })))
    ).then(results => {
      if (cancelled) return;
      const map = {} as Record<Target, string>;
      results.forEach(r => { map[r.id] = r.code; });
      setCodes(map);
    }).catch(console.error).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(codes[activeTab]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal title="Generate Code" onClose={onClose} icon={<Code2 size={16} style={{ color: 'var(--accent)' }} />} width="w-[600px]">
      <div className="flex flex-col gap-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex gap-1">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className="px-3 py-1 rounded text-sm font-medium transition-colors"
                style={{
                  background: activeTab === t.id ? 'var(--accent)' : 'var(--surface-3)',
                  color: activeTab === t.id ? '#fff' : 'var(--text-secondary)',
                  border: '1px solid ' + (activeTab === t.id ? 'transparent' : 'var(--border)'),
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 btn btn-secondary text-xs"
            style={{ color: copied ? '#4ade80' : undefined, borderColor: copied ? 'rgba(74,222,128,0.3)' : undefined }}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <pre
          className="p-4 rounded overflow-x-auto text-sm font-mono leading-relaxed"
          style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', color: 'var(--text-secondary)', minHeight: '160px' }}
        >
          {loading ? <span style={{ color: 'var(--text-muted)' }}>Generating...</span> : (codes[activeTab] || '')}
        </pre>
      </div>
    </Modal>
  );
}
