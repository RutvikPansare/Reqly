import { useState } from 'react';
import { ChevronRight, ChevronDown, Copy, Check } from 'lucide-react';

export function syntaxHighlight(jsonStr: string): string {
  const escaped = jsonStr.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    match => {
      if (/^"/.test(match)) {
        if (/:$/.test(match)) return `<span style="color:#7dd3fc">${match}</span>`;
        return `<span style="color:#86efac">${match}</span>`;
      }
      if (/true|false/.test(match)) return `<span style="color:#c084fc">${match}</span>`;
      if (/null/.test(match)) return `<span style="color:#6b7280">${match}</span>`;
      return `<span style="color:#fdba74">${match}</span>`;
    }
  );
}

export function InteractiveJsonTree({ data, name, isLast = true, defaultOpen = true }: { data: any; name?: string; isLast?: boolean; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const isArray = Array.isArray(data);
  const isObj = data !== null && typeof data === 'object';

  if (!isObj) {
    return (
      <div className="json-line font-mono text-[11px] leading-[18px]">
        {name && <span style={{ color: '#7dd3fc' }}>"{name}"</span>}
        {name && <span className="text-gray-400 mr-1">:</span>}
        <span
          style={{
            color: typeof data === 'string' ? '#86efac' : typeof data === 'number' ? '#fdba74' : typeof data === 'boolean' ? '#c084fc' : '#6b7280'
          }}
        >
          {typeof data === 'string' ? `"${data}"` : String(data)}
        </span>
        {!isLast && <span className="text-gray-400">,</span>}
      </div>
    );
  }

  const entries = Object.entries(data);
  const isEmpty = entries.length === 0;

  return (
    <div className="font-mono text-[11px] leading-[18px]">
      <div className="json-line flex items-center">
        {!isEmpty && (
          <button
            onClick={() => setOpen(!open)}
            className="w-3 h-3 flex items-center justify-center mr-1 rounded hover:bg-white/10 text-gray-500"
          >
            {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          </button>
        )}
        {isEmpty && <span className="w-4" />}
        {name && <span style={{ color: '#7dd3fc' }}>"{name}"</span>}
        {name && <span className="text-gray-400 mr-1">:</span>}
        <span className="text-gray-400">{isArray ? '[' : '{'}</span>
        {!open && !isEmpty && (
          <>
            <span className="text-gray-500 px-1 cursor-pointer hover:text-gray-300" onClick={() => setOpen(true)}>...</span>
            <span className="text-gray-400">{isArray ? ']' : '}'}</span>
            {!isLast && <span className="text-gray-400">,</span>}
          </>
        )}
        {open && isEmpty && (
          <>
            <span className="text-gray-400">{isArray ? ']' : '}'}</span>
            {!isLast && <span className="text-gray-400">,</span>}
          </>
        )}
      </div>
      {open && !isEmpty && (
        <>
          <div className="pl-4 border-l border-white/10 ml-1.5 my-px">
            {entries.map(([k, v], i) => (
              <InteractiveJsonTree
                key={k}
                name={isArray ? undefined : k}
                data={v}
                isLast={i === entries.length - 1}
                defaultOpen={defaultOpen}
              />
            ))}
          </div>
          <div className="json-line ml-1.5 pl-3 items-center">
            <span className="text-gray-400">{isArray ? ']' : '}'}</span>
            {!isLast && <span className="text-gray-400">,</span>}
          </div>
        </>
      )}
    </div>
  );
}

export function CollapsibleJson({ label, data, defaultOpen = true, accent, filter = '', className = '' }: { label: string; data: unknown; defaultOpen?: boolean; accent?: string; filter?: string; className?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(data, null, 2);

  let html = '';
  const hasFilter = filter.trim().length > 0;
  if (hasFilter) {
    html = syntaxHighlight(json);
    const q = filter.toLowerCase();
    const lines = html.split('\n');
    const kept = lines.filter(l => l.toLowerCase().includes(q));
    if (kept.length === 0) html = `<span style="color:var(--text-muted);font-style:italic">No lines match "${filter}"</span>`;
    else html = kept.map(l => `<div class="json-line">${l}</div>`).join('');
  }

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`border border-[var(--border)] rounded flex flex-col min-h-0 shrink min-w-0 w-full overflow-hidden ${open ? className : ''}`}>
      <div
        className="flex items-center gap-1.5 w-full px-3 py-2 text-xs font-semibold text-left transition-colors shrink-0 sticky top-0 z-10 group"
        style={{ background: 'var(--surface-2)' }}
      >
        <button className="flex items-center gap-1.5 hover:opacity-80" onClick={() => setOpen(v => !v)}>
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span style={{ color: accent ?? 'var(--text-primary)' }}>{label}</span>
          <span className="ml-1 text-gray-600 font-normal">
            {Array.isArray(data) ? `${(data as unknown[]).length} item${(data as unknown[]).length !== 1 ? 's' : ''}` : ''}
          </span>
        </button>
        <div className="flex-1" />
        {open && (
          <button
            className="icon-btn hover:bg-[var(--surface-4)] p-1 rounded transition-colors opacity-0 group-hover:opacity-100"
            onClick={handleCopy}
            title="Copy inner data"
          >
            {copied ? <Check size={13} style={{ color: '#4ade80' }} /> : <Copy size={13} style={{ color: 'var(--text-muted)' }} />}
          </button>
        )}
      </div>
      {open && (
        <div
          className="p-3 overflow-auto flex-1 json-tree"
          style={{ background: 'var(--surface-1)', color: 'var(--text-secondary)' }}
        >
          {hasFilter ? (
             <pre className="text-xs font-mono" dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
             <InteractiveJsonTree data={data} defaultOpen={true} />
          )}
        </div>
      )}
    </div>
  );
}
