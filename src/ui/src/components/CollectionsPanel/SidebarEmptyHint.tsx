import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export function SidebarEmptyHint() {
  const [copied, setCopied] = useState(false);
  const prompt = 'Create a Reqly collection from my routes.';

  return (
    <div className="flex items-start gap-1.5 px-1.5 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
      <span className="leading-tight">Ask your agent: "{prompt}"</span>
      <button
        onClick={() => {
          navigator.clipboard.writeText(prompt).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
        className="flex items-center justify-center rounded shrink-0 mt-0.5"
        style={{ width: '18px', height: '18px', color: copied ? '#4ade80' : 'var(--text-muted)', background: 'transparent', border: 'none' }}
        title="Copy"
      >
        {copied ? <Check size={11} /> : <Copy size={11} />}
      </button>
    </div>
  );
}
