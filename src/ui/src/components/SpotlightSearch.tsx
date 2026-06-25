import { useEffect, useState, useRef, useMemo } from 'react';
import { fetchCollections } from '../api';
import { METHOD_BADGE_BASE, methodBadgeClass } from '../lib/colors';

interface SpotlightSearchProps {
  onSelectRequest: (req: any, collectionName: string) => void;
  onClose: () => void;
}

interface ResultItem {
  type: 'collection' | 'request';
  label: string;
  sublabel: string;
  method?: string;
  collectionName: string;
  request?: any;
}

export function SpotlightSearch({ onSelectRequest, onClose }: SpotlightSearchProps) {
  const [query, setQuery] = useState('');
  const [collections, setCollections] = useState<any[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchCollections().then(setCollections).catch(console.error);
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = useMemo<ResultItem[]>(() => {
    const q = query.trim().toLowerCase();
    const items: ResultItem[] = [];
    for (const col of collections) {
      const colMatch = !q || col.name.toLowerCase().includes(q);
      if (colMatch) {
        items.push({
          type: 'collection',
          label: col.name,
          sublabel: `${col.requests?.length || 0} requests`,
          collectionName: col.name
        });
      }
      for (const req of col.requests || []) {
        const matches =
          !q ||
          req.name?.toLowerCase().includes(q) ||
          req.url?.toLowerCase().includes(q) ||
          col.name.toLowerCase().includes(q);
        if (matches) {
          items.push({
            type: 'request',
            label: req.name,
            sublabel: req.url,
            method: req.method,
            collectionName: col.name,
            request: req
          });
        }
      }
    }
    return items.slice(0, 50);
  }, [query, collections]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const choose = (item: ResultItem) => {
    if (item.type === 'request' && item.request) {
      onSelectRequest(item.request, item.collectionName);
      onClose();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = results[activeIndex];
      if (item) choose(item);
    } else if (e.key === 'Escape') {
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
        className="w-full max-w-xl rounded-xl overflow-hidden"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--border-strong)', boxShadow: '0 32px 64px rgba(0,0,0,0.6)' }}
        onClick={e => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="w-full bg-transparent px-4 py-3.5 text-sm outline-none"
          style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' }}
          placeholder="Search collections, requests, URLs..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="max-h-80 overflow-y-auto">
          {results.length === 0 && (
            <p className="text-xs italic px-4 py-3" style={{ color: 'var(--text-muted)' }}>No results</p>
          )}
          {results.map((item, i) => (
            <div
              key={`${item.type}-${item.collectionName}-${item.label}-${i}`}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => choose(item)}
              className="flex items-center gap-3 px-4 py-2 cursor-pointer transition-colors"
              style={{ background: i === activeIndex ? 'var(--surface-3)' : 'transparent' }}
            >
              {item.method ? (
                <span className={`${METHOD_BADGE_BASE} ${methodBadgeClass(item.method)} shrink-0`}>
                  {item.method}
                </span>
              ) : (
                <span className="text-[10px] w-12 shrink-0" style={{ color: 'var(--text-muted)' }}>COL</span>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{item.label}</div>
                <div className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>{item.sublabel}</div>
              </div>
              <span className="text-[10px] shrink-0" style={{ color: 'var(--text-muted)' }}>{item.collectionName}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
