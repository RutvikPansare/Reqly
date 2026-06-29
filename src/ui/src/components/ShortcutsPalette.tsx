import { useEffect, useState, useRef, useMemo } from 'react';
import { Search } from 'lucide-react';

interface Shortcut {
  group: 'Request' | 'Navigation' | 'Editor';
  label: string;
  keys: string[];
}

const SHORTCUTS: Shortcut[] = [
  { group: 'Request', label: 'Send request', keys: ['⌘', '↵'] },
  { group: 'Request', label: 'Save request', keys: ['⌘', 'S'] },
  { group: 'Navigation', label: 'Search collections & requests', keys: ['⌘', 'K'] },
  { group: 'Navigation', label: 'Toggle console / terminal panel', keys: ['Ctrl', '`'] },
  { group: 'Navigation', label: 'Open this shortcuts palette', keys: ['?'] },
  { group: 'Navigation', label: 'Close any dialog or panel', keys: ['Esc'] },
  { group: 'Editor', label: 'Confirm inline rename', keys: ['↵'] },
  { group: 'Editor', label: 'Cancel inline rename', keys: ['Esc'] },
];

const GROUP_ORDER: Shortcut['group'][] = ['Request', 'Navigation', 'Editor'];

export function ShortcutsPalette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = SHORTCUTS.filter(s => !q || s.label.toLowerCase().includes(q));
    const byGroup = new Map<string, Shortcut[]>();
    for (const s of filtered) {
      if (!byGroup.has(s.group)) byGroup.set(s.group, []);
      byGroup.get(s.group)!.push(s);
    }
    return GROUP_ORDER.filter(g => byGroup.has(g)).map(g => ({ group: g, items: byGroup.get(g)! }));
  }, [query]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === '?') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      style={{ background: 'rgba(0,0,0,0.65)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded overflow-hidden"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--border-strong)', boxShadow: '0 32px 64px rgba(0,0,0,0.6)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <Search size={14} style={{ color: 'var(--text-muted)' }} className="shrink-0" />
          <input
            ref={inputRef}
            className="w-full bg-transparent py-3.5 text-sm outline-none"
            style={{ color: 'var(--text-primary)' }}
            placeholder="Search shortcuts..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
        <div className="max-h-96 overflow-y-auto py-2">
          {grouped.length === 0 && (
            <p className="text-xs italic px-4 py-3" style={{ color: 'var(--text-muted)' }}>No matching shortcuts</p>
          )}
          {grouped.map(({ group, items }) => (
            <div key={group} className="mb-1">
              <div className="px-4 py-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                {group}
              </div>
              {items.map(s => (
                <div key={s.label} className="flex items-center justify-between px-4 py-1.5">
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{s.label}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    {s.keys.map((k, i) => (
                      <kbd
                        key={i}
                        className="text-xs rounded px-1.5 py-0.5 font-mono"
                        style={{ background: 'var(--surface-3)', border: '1px solid var(--border-strong)', color: 'var(--text-secondary)' }}
                      >
                        {k}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
