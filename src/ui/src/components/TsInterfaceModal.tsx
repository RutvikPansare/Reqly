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
    <Modal title="TypeScript Interface" onClose={onClose} icon={<Braces size={16} style={{ color: 'var(--accent)' }} />} width="w-[560px]">
      <div className="relative">
        <button
          onClick={handleCopy}
          className="absolute top-2 right-2 z-10 flex items-center gap-1.5 btn btn-secondary text-xs"
          style={{ color: copied ? '#4ade80' : undefined, borderColor: copied ? 'rgba(74,222,128,0.3)' : undefined }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
        <pre
          className="p-4 pt-10 rounded overflow-x-auto text-sm font-mono leading-relaxed"
          style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', color: '#7dd3fc', maxHeight: '420px', overflowY: 'auto' }}
        >
          {tsCode}
        </pre>
      </div>
    </Modal>
  );
}
