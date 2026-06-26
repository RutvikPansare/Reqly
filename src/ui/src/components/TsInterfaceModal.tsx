import { useMemo, useState } from 'react';
import { Braces, Copy, Check } from 'lucide-react';
import { Modal } from './ui/Modal';
import { jsonToTsInterface } from '../lib/ts-interface';

interface TsInterfaceModalProps {
  body: unknown;
  onClose: () => void;
}

export function TsInterfaceModal({ body, onClose }: TsInterfaceModalProps) {
  const [copied, setCopied] = useState(false);

  const tsCode = useMemo(() => {
    try {
      const parsed = typeof body === 'string' ? JSON.parse(body) : body;
      return jsonToTsInterface(parsed, 'Response');
    } catch {
      return '// Could not parse response body as JSON';
    }
  }, [body]);

  const handleCopy = () => {
    navigator.clipboard.writeText(tsCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal title="TypeScript Interface" onClose={onClose} icon={<Braces size={16} style={{ color: 'var(--accent)' }} />}>
      <div className="flex flex-col gap-0" style={{ minWidth: '480px' }}>
        <div className="flex justify-end mb-2">
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
          style={{ background: 'var(--surface-0)', border: '1px solid var(--border)', color: '#7dd3fc', maxHeight: '360px', overflowY: 'auto' }}
        >
          {tsCode}
        </pre>
      </div>
    </Modal>
  );
}
